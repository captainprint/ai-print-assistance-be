require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Image = require('../models/Image');

const PRODUCTS = [
  {
    name: 'Business Cards',
    category: 'Cards',
    description: 'Professional business cards in standard size 3.5 x 2 inches. Available as Classic, Premium, Environment Kraft, Foil, Soft Touch, and Raised Spot UV.',
    minQuantity: 100,
    paperStocks: [
      { name: '14pt Cardstock', description: 'Standard weight for Classic business cards.', compatibleFinishes: ['Gloss UV', 'Uncoated'] },
      { name: '16pt Laminated', description: 'Used for Soft Touch and Raised Spot UV cards.', compatibleFinishes: ['Soft-Touch Matte', 'Raised Spot UV'] },
      { name: '17pt Cougar Smooth', description: 'Premium smooth stock for Premium Matte and Foil cards.', compatibleFinishes: ['Matte', 'Metallic Foil'] },
      { name: '17pt Kraft', description: 'Eco-friendly natural kraft look.', compatibleFinishes: ['Uncoated'] },
    ],
    finishes: [
      { name: 'Gloss UV', description: 'High-shine coating, vibrant colors. Classic 14pt.' },
      { name: 'Uncoated', description: 'Natural, writable surface. Classic 14pt or Kraft 17pt.' },
      { name: 'Matte', description: 'Non-reflective, clean and professional. Premium 17pt Cougar Smooth. Production: 1 business day.' },
      { name: 'Soft-Touch Matte', description: 'Velvety texture, premium feel. 16pt Laminated. Production: 2–3 business days.', incompatibleWith: ['Raised Spot UV'] },
      { name: 'Raised Spot UV', description: 'Raised selective gloss on specific elements. 16pt Laminated. Production: 2–3 business days.', incompatibleWith: ['Soft-Touch Matte'] },
      { name: 'Metallic Foil', description: 'Gold, silver, or colored metallic elements. 14pt or 17pt Cougar Smooth. Production: 5–7 business days.' },
    ],
    sizes: [{ name: 'Standard', dimensions: '3.5 x 2 inches' }],
    priceRanges: {
      economy: '$20.83+ / 100 cards — Classic 14pt Gloss UV (1–5 business days)',
      standard: '$31.45+ / 100 cards — Soft Touch 16pt Laminated (2–3 business days)',
      premium: '$52.70+ / 100 cards — Raised Spot UV 16pt Laminated (2–3 business days)',
      luxury: '$262.65+ / 100 cards — Metallic Foil (5–7 business days)',
    },
    tags: ['business cards', 'cards', 'networking', 'professional'],
  },
  {
    name: 'Flyers',
    category: 'Marketing',
    description: 'Single-page promotional materials — great for menus, promotions, and events.',
    minQuantity: 2,
    paperStocks: [
      { name: '100lb Gloss Text', description: 'Vivid colors, smooth finish.', compatibleFinishes: ['Gloss UV', 'Aqueous Coating'] },
      { name: '100lb Matte Text', description: 'Soft finish, professional non-glare look.', compatibleFinishes: ['Matte', 'Aqueous Coating'] },
    ],
    finishes: [
      { name: 'Gloss UV', description: 'Vivid, eye-catching finish.' },
      { name: 'Matte', description: 'Subdued, professional non-glare finish.' },
      { name: 'Aqueous Coating', description: 'Protective clear coat with subtle sheen.' },
    ],
    sizes: [
      { name: '4x9', dimensions: '4 x 9 inches' },
      { name: 'Half Page', dimensions: '8.5 x 5.5 inches' },
      { name: 'Letter', dimensions: '8.5 x 11 inches' },
      { name: 'Tabloid', dimensions: '11 x 17 inches' },
    ],
    priceRanges: {
      economy: 'Contact for pricing (2–10 flyers)',
      standard: 'Contact for pricing (100–250 flyers)',
      premium: 'Contact for pricing (250–500 flyers)',
      luxury: 'Contact for pricing (500+ flyers)',
    },
    tags: ['flyers', 'marketing', 'promotions', 'events'],
  },
  {
    name: 'Brochures',
    category: 'Marketing',
    description: 'Informational folded print materials for detailed product or service presentation.',
    minQuantity: 25,
    paperStocks: [
      { name: '100lb Gloss Text', description: 'Standard brochure paper — vivid and smooth.', compatibleFinishes: ['Gloss UV', 'Aqueous Coating'] },
      { name: '100lb Matte Text', description: 'Professional matte finish brochure paper.', compatibleFinishes: ['Matte', 'Aqueous Coating'] },
    ],
    finishes: [
      { name: 'Gloss UV', description: 'Vibrant full-gloss finish.' },
      { name: 'Matte', description: 'Clean, readable non-glare finish.' },
      { name: 'Aqueous Coating', description: 'Protective clear coat.' },
    ],
    sizes: [
      { name: '4x9', dimensions: '4 x 9 inches' },
      { name: 'Letter', dimensions: '8.5 x 11 inches' },
      { name: 'Tabloid', dimensions: '11 x 17 inches' },
    ],
    priceRanges: {
      economy: 'Contact for pricing (25–50 brochures)',
      standard: 'Contact for pricing (100–250 brochures)',
      premium: 'Contact for pricing (500–1000 brochures)',
      luxury: 'Contact for pricing (2500–5000 brochures)',
    },
    tags: ['brochures', 'folded', 'marketing', 'tri-fold', 'bi-fold'],
  },
  {
    name: 'Postcards',
    category: 'Direct Mail',
    description: 'Cost-effective direct mail and promotional postcards. Use code DISCOUNT15 for 15% off.',
    minQuantity: 50,
    paperStocks: [
      { name: '14pt Gloss Cardstock', description: 'Standard postcard weight with gloss finish.', compatibleFinishes: ['Gloss UV'] },
    ],
    finishes: [{ name: 'Gloss UV', description: 'Vivid, eye-catching finish.' }],
    sizes: [
      { name: '4x6', dimensions: '4 x 6 inches' },
      { name: '5x7', dimensions: '5 x 7 inches' },
      { name: '6x9', dimensions: '6 x 9 inches' },
      { name: '8.5x11', dimensions: '8.5 x 11 inches' },
    ],
    priceRanges: {
      economy: 'Contact for pricing (50–100 postcards)',
      standard: 'Contact for pricing (250–500 postcards)',
      premium: 'Contact for pricing (1000–5000 postcards)',
      luxury: 'Contact for pricing (10,000–15,000 postcards)',
    },
    tags: ['postcards', 'direct mail', 'promotions', 'marketing'],
  },
  {
    name: 'Large Format Printing',
    category: 'Large Format',
    description: 'High-resolution large format prints for events, retail, and signage. Contact for a free quote.',
    minQuantity: 1,
    paperStocks: [
      { name: 'Vinyl', description: 'Durable outdoor material for banners and yard signs.', compatibleFinishes: ['Matte', 'Gloss UV'] },
      { name: 'Fabric', description: 'Lightweight indoor fabric for display banners.', compatibleFinishes: ['Matte'] },
      { name: 'Foam Board', description: 'Rigid indoor material for Foam Core Signs.', compatibleFinishes: ['Matte', 'Gloss UV'] },
      { name: 'Canvas', description: 'Premium material for Canvas Art reproductions.', compatibleFinishes: ['Matte'] },
      { name: 'Coroplast', description: 'Durable corrugated plastic for outdoor yard signs.', compatibleFinishes: ['Matte', 'Gloss UV'] },
    ],
    finishes: [
      { name: 'Gloss UV', description: 'Vibrant colors for indoor display.' },
      { name: 'Matte', description: 'No glare, suitable for any lighting.' },
    ],
    sizes: [
      { name: 'Large Poster', dimensions: 'Various sizes' },
      { name: 'Pull Up Retractable Banner', dimensions: 'Standard retractable banner' },
      { name: 'Vinyl Banner', dimensions: 'Custom sizes' },
      { name: 'Custom', dimensions: 'Custom — request a free quote' },
    ],
    priceRanges: {
      economy: 'Contact for pricing — get a free quote',
      standard: 'Contact for pricing — get a free quote',
      premium: 'Contact for pricing — get a free quote',
      luxury: 'Contact for pricing — get a free quote',
    },
    tags: ['banners', 'posters', 'large format', 'signage', 'events', 'retail'],
  },
];

const IMAGES = [
  { filename: 'bc-classic-gloss.jpg', url: 'https://cdn.example.com/images/bc-classic-gloss.jpg', altText: 'Classic gloss business card', tags: { productType: 'Business Cards', industry: ['restaurant', 'retail'], style: ['modern', 'bold'], finishes: ['Gloss UV'], budget: ['economy'] } },
  { filename: 'bc-premium-matte.jpg', url: 'https://cdn.example.com/images/bc-premium-matte.jpg', altText: 'Premium matte business card', tags: { productType: 'Business Cards', industry: ['real estate', 'consulting'], style: ['modern', 'minimal', 'professional'], finishes: ['Matte'], budget: ['standard'] } },
  { filename: 'bc-foil-gold.jpg', url: 'https://cdn.example.com/images/bc-foil-gold.jpg', altText: 'Gold metallic foil business card', tags: { productType: 'Business Cards', industry: ['finance', 'law', 'luxury'], style: ['luxury', 'elegant', 'classic'], finishes: ['Metallic Foil'], budget: ['luxury'] } },
  { filename: 'bc-softtouch.jpg', url: 'https://cdn.example.com/images/bc-softtouch.jpg', altText: 'Soft touch business card', tags: { productType: 'Business Cards', industry: ['design', 'photography'], style: ['luxury', 'modern', 'premium'], finishes: ['Soft-Touch Matte'], budget: ['standard', 'premium'] } },
  { filename: 'flyer-event-bold.jpg', url: 'https://cdn.example.com/images/flyer-event-bold.jpg', altText: 'Bold event promotional flyer', tags: { productType: 'Flyers', industry: ['events', 'entertainment'], style: ['bold', 'modern', 'playful'], finishes: ['Gloss UV'], budget: ['economy', 'standard'] } },
  { filename: 'flyer-menu-restaurant.jpg', url: 'https://cdn.example.com/images/flyer-menu-restaurant.jpg', altText: 'Restaurant menu flyer', tags: { productType: 'Flyers', industry: ['restaurant', 'food'], style: ['elegant', 'modern'], finishes: ['Gloss UV'], budget: ['standard'] } },
  { filename: 'brochure-realestate.jpg', url: 'https://cdn.example.com/images/brochure-realestate.jpg', altText: 'Real estate brochure with gloss finish', tags: { productType: 'Brochures', industry: ['real estate', 'property'], style: ['modern', 'professional'], finishes: ['Gloss UV'], budget: ['standard', 'premium'] } },
  { filename: 'brochure-healthcare.jpg', url: 'https://cdn.example.com/images/brochure-healthcare.jpg', altText: 'Healthcare brochure with matte finish', tags: { productType: 'Brochures', industry: ['healthcare', 'medical'], style: ['minimal', 'professional'], finishes: ['Matte'], budget: ['standard'] } },
  { filename: 'postcard-realestate.jpg', url: 'https://cdn.example.com/images/postcard-realestate.jpg', altText: 'Real estate direct mail postcard', tags: { productType: 'Postcards', industry: ['real estate'], style: ['professional', 'modern'], finishes: ['Gloss UV'], budget: ['standard'] } },
  { filename: 'banner-vinyl-event.jpg', url: 'https://cdn.example.com/images/banner-vinyl-event.jpg', altText: 'Vinyl banner for outdoor event', tags: { productType: 'Large Format Printing', industry: ['events', 'retail'], style: ['bold', 'modern'], finishes: ['Matte'], budget: ['standard', 'premium'] } },
];

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/print-assistance';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  await Product.collection.drop().catch(() => {});
  await Image.collection.drop().catch(() => {});

  const products = await Product.insertMany(PRODUCTS);
  const images = await Image.insertMany(IMAGES);

  console.log(`Seeded ${products.length} products and ${images.length} images`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
