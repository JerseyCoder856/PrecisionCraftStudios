window.addEventListener("DOMContentLoaded", () => {

  let cart = JSON.parse(localStorage.getItem("cart")) || [];

  const itemsContainer = document.getElementById("checkoutItems");
  const totalContainer = document.getElementById("checkoutTotal");

  function getTotal() {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }

  function render() {

    if (!cart.length) {
      itemsContainer.innerHTML = "Cart is empty";
      totalContainer.innerText = "$0.00";
      return;
    }

    itemsContainer.innerHTML = cart.map(i => `
      <div>
        ${i.name} x${i.qty} - $${(i.price * i.qty).toFixed(2)}
      </div>
    `).join("");

    totalContainer.innerText = "Total: $" + getTotal().toFixed(2);
  }

  paypal.Buttons({

    createOrder: (data, actions) => {
      return actions.order.create({
        purchase_units: [{
          amount: { value: getTotal().toFixed(2) }
        }]
      });
    },

    onApprove: (data, actions) => {
      return actions.order.capture().then(details => {

        localStorage.setItem("lastOrder", JSON.stringify({
          cart,
          payment: details,
          orderId: Date.now()
        }));

        localStorage.removeItem("cart");

        window.location.href = "success.html";
      });
    }

  }).render("#paypal-button-container");

  render();
});
