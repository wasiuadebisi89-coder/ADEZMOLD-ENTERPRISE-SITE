// Single source of truth for business details shown on the site.
// Anything set to `null` is UNVERIFIED / NOT YET PROVIDED and is hidden from
// the page rather than guessed. Fill these in as they are confirmed.

export const site = {
  name: 'Adezmold Business Consulting',
  shortName: 'Adezmold',
  descriptor: 'Business Consulting',
  summary:
    'Financial control, stock systems and operating structure for Nigerian produce merchants, distributors and growing SMEs.',

  // Production URL — needed for canonical links, sitemap and Open Graph (Stage 7).
  url: null,

  contact: {
    phoneDisplay: '0703 524 6809',
    phoneHref: 'tel:+2347035246809',
    // PLACEHOLDER: the domain email for public contact and lead alerts has not been provided yet.
    email: null,
    addressLines: ['2, Oluwo Oke Shopping Complex', 'Agbowo Area, Odo-Ori', 'Iwo, Osun State, Nigeria'],
  },

  social: {
    // Needed for LinkedIn acquisition (Stage 3/7). Hidden until provided.
    linkedinProfile: null,
    linkedinCompany: null,
  },

  founder: {
    name: 'Adebisi Wasiu Shina',
    role: 'Founder',
    // PLACEHOLDER: add a short verified biography and a photo before launch. Hidden while null.
    bio: null,
    photo: null,
  },

  features: {
    // Case studies stay hidden until verified results (with client permission) exist.
    caseStudies: false,
  },
};

// Images from the Stitch export. They are hot-linked from Google's preview
// host, which can expire: replace with self-hosted photos in /public before launch.
export const images = {
  logo: {
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuARtJqTS_U3ckYC42kVVsdj0ojI_ZkmPumCvVyOIIxISbYgPDVCDrFfflIfE4oNlRFDH-CMGsxYU1HpdLG5Kyx6xP88qXBwPujKlsPjuDFMfHxowHYY63WMdQfcFp4eZRXxVSZlGPNAQ9G53lU23qI2lCJvQ8rocHqhceq_2OFpoU-rDDi9k1_dinVYXPl7to-j72B0LopwbjYQqZmZaxIjb9pV_k-qH0CRw5SNO0E8fYcBCZkdRyo',
    alt: 'Adezmold Business Consulting logo',
  },
  hero: {
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBqiSLC0-2Wmj_E35h9t4Le3WIrlPr6qNzSN5Pz1Kv-5-Plg6UItC8VAYPbGKP3nlLohIXAyf80tgK4sRdWv0M-WRZliX3-THgU7PVhuwddgtNqKfkZCLjozJUcesUVrZOsZtpBe3SqkcmG9YauCzmytBLkXOEphp9vW2lHpi7cD-Y57mSKPST4TvneMfIati66BYrp-jmks64R1er94MFPWb97yxa2i2b7AnCSzHq5s0WVX1cvAX4',
    alt: 'Produce merchant checking inventory records in a warehouse stacked with crates of peppers, tomatoes and grains',
  },
};
