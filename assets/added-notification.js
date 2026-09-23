if (!customElements.get('added-notification')) {
  const AddedNotification = class extends HTMLElement {
    connectedCallback() {
      this.dismissOthers();
      this.setProductTitle(this.dataset.productTitle);
      this.setProductImg(this.dataset.productImg); //added by Biswajit
      this.display();
    }

    disconnectedCallback() {
      clearTimeout(this.delayedDismissTimeout);
    }

    dismissOthers() {
      document.querySelectorAll('.added-notification').forEach((notification) => {
        if (notification !== this) {
          notification.dismiss();
        }
      });
    }

    setProductTitle(productTitle) {
      this.querySelector('.added-notification__message-title').innerText = productTitle;
    }

    //added by Biswajit
    setProductImg(productImg) {
      this.querySelector('.added-notification__message-img>img').src = productImg;
    }

    display() {
      // reveal
      setTimeout(() => {
        this.classList.remove('added-notification--hidden');
        this.classList.add('animate__slideInLeft'); //added by Biswajit
      }, 10);

      //added by Biswajit
      setTimeout(() => this.classList.remove('animate__slideInLeft'), 1000);

      // dismiss after a short period of time
      this.delayedDismissTimeout = setTimeout(this.dismiss.bind(this), 6000);

      // add events to internal links
      this.querySelector('.added-notification__close').addEventListener('click', this.dismiss.bind(this));
      if (theme.settings.cartType === 'drawer') {
        const cartLinks = this.querySelectorAll('.added-notification__message-text a[href$="/cart"]');
        cartLinks.forEach((el) => {
          el.addEventListener('click', (evt) => {
            evt.preventDefault();
            document.querySelector('.js-cart-drawer').open();
            this.dismiss();
          });
        });
      }
    }

    dismiss(evt) {
      if (evt) { evt.preventDefault(); }
      this.classList.add('animate__fadeOutUpBig'); //added by Biswajit
      setTimeout(()=>{
        this.classList.add('added-notification--dismissed');
        this.classList.remove('animate__fadeOutUpBig'); //added by Biswajit
        this.remove.bind(this);
      }, 2000);
    }
  };

  window.customElements.define('added-notification', AddedNotification);
}
