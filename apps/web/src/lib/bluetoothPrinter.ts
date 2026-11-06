import { chunk } from './escpos';

/*
 * Web Bluetooth printing for portable ESC/POS thermal printers. Works in Chrome and
 * Edge on Android, Windows, macOS and ChromeOS over a secure origin. Safari and iOS
 * have no Web Bluetooth, and printers that only speak Bluetooth Classic (SPP) cannot
 * be reached from a browser; both fall back to the system print dialog.
 */

interface Characteristic {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse?: (v: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (v: BufferSource) => Promise<void>;
  writeValue?: (v: BufferSource) => Promise<void>;
}
interface Service {
  getCharacteristics(): Promise<Characteristic[]>;
}
interface Server {
  connected: boolean;
  connect(): Promise<Server>;
  getPrimaryServices(): Promise<Service[]>;
}
interface Device {
  name?: string;
  gatt?: Server;
}
interface BluetoothApi {
  getAvailability?: () => Promise<boolean>;
  requestDevice(opts: {
    acceptAllDevices: boolean;
    optionalServices: (string | number)[];
  }): Promise<Device>;
}

/** GATT services used by common portable receipt printers. */
export const PRINTER_SERVICES: (string | number)[] = [
  0x18f0,
  0xff00,
  0xffe0,
  0xfee7,
  0xae30,
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

function api(): BluetoothApi | null {
  const nav = typeof navigator === 'undefined' ? null : (navigator as { bluetooth?: BluetoothApi });
  return nav?.bluetooth ?? null;
}

export const bluetoothSupported = () => api() !== null && window.isSecureContext;

export class PrinterError extends Error {
  override name = 'PrinterError';
}

let device: Device | null = null;
let target: Characteristic | null = null;

export const pairedPrinterName = () => (device ? device.name || 'Bluetooth printer' : null);

export function forgetPrinter() {
  device = null;
  target = null;
}

async function findWritable(server: Server): Promise<Characteristic> {
  const services = await server.getPrimaryServices();
  for (const s of services) {
    let chars: Characteristic[];
    try {
      chars = await s.getCharacteristics();
    } catch {
      continue;
    }
    const c = chars.find((x) => x.properties.write || x.properties.writeWithoutResponse);
    if (c) return c;
  }
  throw new PrinterError(
    'This device does not accept print data over Bluetooth LE. Use "Print" to send it through the system print dialog.',
  );
}

/** Asks the person to pick a printer. Must run from a click. */
export async function choosePrinter(): Promise<string> {
  const bt = api();
  if (!bt)
    throw new PrinterError(
      'This browser cannot use Bluetooth. Use Chrome on Android or a computer.',
    );
  try {
    device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
  } catch (e) {
    if (e instanceof Error && e.name === 'NotFoundError')
      throw new PrinterError('No printer was chosen.');
    throw new PrinterError(e instanceof Error ? e.message : 'Bluetooth is not available.');
  }
  target = null;
  return pairedPrinterName()!;
}

async function connect(): Promise<Characteristic> {
  if (!device?.gatt) throw new PrinterError('Choose a printer first.');
  if (target && device.gatt.connected) return target;
  try {
    const server = await device.gatt.connect();
    target = await findWritable(server);
    return target;
  } catch (e) {
    target = null;
    if (e instanceof PrinterError) throw e;
    throw new PrinterError(
      'Could not connect to the printer. Check it is switched on, nearby and not connected to another phone.',
    );
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends ESC/POS bytes to the chosen printer, reconnecting if it went to sleep. */
export async function sendToPrinter(bytes: Uint8Array): Promise<void> {
  const c = await connect();
  const withResponse = c.properties.write && (c.writeValueWithResponse ?? c.writeValue);
  // Long writes with response are reassembled by the stack; without response each
  // write must fit the default 20-byte payload, and slow printers need a breather.
  const size = withResponse ? 180 : 20;
  try {
    for (const part of chunk(bytes, size)) {
      const copy = part.slice();
      if (withResponse) await withResponse.call(c, copy);
      else {
        await (c.writeValueWithoutResponse ?? c.writeValue)!.call(c, copy);
        await pause(10);
      }
    }
  } catch {
    target = null;
    throw new PrinterError('The printer stopped responding. Try printing again.');
  }
}
