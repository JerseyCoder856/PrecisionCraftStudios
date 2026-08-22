const test = require('node:test');
const assert = require('node:assert/strict');
const { customerFromPayPal, validateCustomer } = require('../src/server/orders');

test('PayPal checkout customer does not require duplicate shipping fields before payment', () => {
  assert.deepEqual(validateCustomer({ checkoutSource: 'paypal' }), {
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
    checkoutSource: 'paypal',
    isGift: false,
    giftMessage: ''
  });
});

test('PayPal capture details populate the saved shipping and contact information', () => {
  const customer = customerFromPayPal({ isGift: true, giftMessage: 'Happy birthday!' }, {
    payer: {
      name: { given_name: 'Jane', surname: 'Doe' },
      email_address: 'jane@example.com',
      phone: { phone_number: { national_number: '5551234567' } }
    },
    purchase_units: [{
      shipping: {
        name: { full_name: 'Jane D. Doe' },
        address: {
          address_line_1: '123 Main St',
          admin_area_2: 'Springfield',
          admin_area_1: 'IL',
          postal_code: '62704',
          country_code: 'US'
        }
      }
    }]
  });

  assert.equal(customer.name, 'Jane D. Doe');
  assert.equal(customer.email, 'jane@example.com');
  assert.equal(customer.phone, '5551234567');
  assert.equal(customer.address, '123 Main St, Springfield IL 62704, US');
  assert.equal(customer.checkoutSource, 'paypal');
  assert.equal(customer.giftMessage, 'Happy birthday!');
});
