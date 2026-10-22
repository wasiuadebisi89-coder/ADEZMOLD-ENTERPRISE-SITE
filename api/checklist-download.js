// GET /api/checklist-download?t=<signed token> — serves the checklist PDF (Vercel serverless function).
import { checklistDownloadHandler } from '../server/endpoints.js';

export default checklistDownloadHandler;
