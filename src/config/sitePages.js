// Static site pages the AI is allowed to link to in chat replies (e.g. when
// pointing a customer to pricing instead of quoting a number itself). These
// are verified real URLs, not guesses — the model must never invent a URL
// beyond what's provided here or in a product's own sourceUrl.
const BASE_URL = (process.env.CUSTOMER_APP_URL || 'https://staging13.captainprint.com').replace(/\/+$/, '');

const CONTACT_US_URL = `${BASE_URL}/contact-us/`;

// Maps our internal Product.category bucket (see mapCategory in
// scraperService.js) to the real WooCommerce category archive page that
// lists every product — and its pricing — in that bucket. Each URL here was
// confirmed live against the site (via its product_cat sitemap) before being
// added. Don't add an entry without verifying it actually resolves — a wrong
// guess means the AI hands a customer a broken link.
const CATEGORY_PAGE_URLS = {
  'Business Cards': `${BASE_URL}/product-category/business-cards/`,
  Cards: `${BASE_URL}/product-category/business-cards/`, // legacy/duplicate bucket, same real page
  'Large Format': `${BASE_URL}/product-category/signs-banners/`,
  Apparel: `${BASE_URL}/product-category/apparel-promotional/`,
  Promotional: `${BASE_URL}/product-category/print-products/magnets/`,
  'Invites & Stationery': `${BASE_URL}/product-category/invites-stationery/`,
  Labels: `${BASE_URL}/product-category/labels-and-packaging/`,
  Marketing: `${BASE_URL}/product-category/print-products/`,
  'Direct Mail': `${BASE_URL}/product-category/print-products/`,
};

module.exports = { CONTACT_US_URL, CATEGORY_PAGE_URLS };
