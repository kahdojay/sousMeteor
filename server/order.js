if(Meteor.isServer){
  Meteor.methods({

    convertOldOrders: function() {
      // fetch all Orders
      var allOrders = Orders.find().fetch();

      // iterate through each one
      allOrders.forEach(function(order){
        // if orderId does not exists in CartItems
        var orderCartItemCount = CartItems.find({orderId: order._id}).count();
        if(orderCartItemCount === 0){
          // iterate over the order.orderDetails.products
          var productIds = Object.keys(order.orderDetails.products)
          productIds.forEach(function(productId){
            var productDetails = order.orderDetails.products[productId];
            var cartItemAttributes = {
              _id: CartItems._makeNewID(),
              userId: order.userId,
              teamId: order.teamId,
              purveyorId: order.purveyorId,
              productId: productId,
              quantity: productDetails.quantity,
              note: productDetails.note || '',
              status: STATUS.CART_ITEM.ORDERED,
              orderId: order._id,
              createdAt: (new Date()).toISOString(),
              updatedAt: (new Date()).toISOString(),
            };

            Meteor.call('addCartItem', order.userId, order.teamId, cartItemAttributes)
          })
        }
      })
    },

    getOrders: function(teamId, orderIds) {
      var queryOptions = {
        sort: { orderedAt: -1 },
      };
      var query = {
        teamId: teamId,
        _id: { $in: orderIds }
      };
      log.trace("Retrieving orders, with query: ", query, " queryOptions: ", queryOptions);
      return Orders.find(query,queryOptions).fetch();
    },

    getTeamOrders: function(teamId, beforeOrderedAtDate) {
      var orderedAtDate = (new Date()).toISOString();
      if(beforeOrderedAtDate){
        orderedAtDate = beforeOrderedAtDate
      }
      var queryOptions = {
        sort: { orderedAt: -1 },
        limit: 10,
      };
      var query = {
        teamId: teamId,
        orderedAt: { $lte: orderedAtDate },
      };
      log.trace("Retrieving orders, with query: ", query, " queryOptions: ", queryOptions);
      return Orders.find(query,queryOptions).fetch();
    },

    getTeamOrderItems: function(teamId, orderIds) {
      var query = {
        teamId: teamId,
        orderId: { $in: orderIds },
      }
      log.trace("Retrieving order items, with query: ", query);
      return CartItems.find(query).fetch();
    },

    getOrderDetails: function(orderId) {
      return Orders.findOne({_id: orderId});
    },

    addCartItem: function(userId, teamId, cartItemAttributes) {
      log.debug("ADD CART ITEM ATTRS - userId: ", userId, ' teamId: ', teamId, ' cart attrs: ', cartItemAttributes);
      var ret = {
        upsert: null,
        success: null,
      };

      var cartItemLookup = {
        teamId: teamId,
        purveyorId: cartItemAttributes.purveyorId,
        productId: cartItemAttributes.productId,
        status: STATUS.CART_ITEM.NEW,
      };
      var cartItem = CartItems.findOne(cartItemLookup);
      var cartItemUpsert = {};

      if(cartItem === undefined){
        var product = Products.findOne({_id: cartItemAttributes.productId});
        // insert attributes
        cartItemUpsert.teamId = teamId;
        cartItemUpsert.userId = userId;
        cartItemUpsert.purveyorId = cartItemAttributes.purveyorId;
        cartItemUpsert.productId = cartItemAttributes.productId;
        cartItemUpsert.productName = product ? product.name : '';
        cartItemUpsert.quantity = cartItemAttributes.quantity;
        cartItemUpsert.note = cartItemAttributes.note;
        cartItemUpsert.createdAt = (new Date()).toISOString();
        cartItemUpsert.updatedAt = (new Date()).toISOString();

        if(cartItemAttributes.hasOwnProperty('_id') === true){
          cartItemUpsert._id = cartItemAttributes._id;
        }

        var cartItemStatusLookup = Object.keys(STATUS.CART_ITEM)
        if(cartItemAttributes.hasOwnProperty('status') === true && cartItemStatusLookup.indexOf(cartItemAttributes.status) !== -1){
          cartItemUpsert.status = cartItemAttributes.status;
        } else {
          cartItemUpsert.status = STATUS.CART_ITEM.NEW;
        }

        if(cartItemAttributes.hasOwnProperty('orderId') === true){
          cartItemUpsert.orderId = cartItemAttributes.orderId;
        } else {
          cartItemUpsert.orderId = null;
        }

      } else {
        // update attributes
        cartItemUpsert.quantity = cartItemAttributes.quantity;
        cartItemUpsert.note = cartItemAttributes.note;
        cartItemUpsert.updatedAt = (new Date()).toISOString();
      }

      ret.upsert = CartItems.update(cartItemLookup, cartItemUpsert, {upsert: true});
      ret.success = true;

      log.debug("ADD CART RET ", ret);

      return ret;
    },

    updateCartItem: function(userId, teamId, cartItemId, cartItemAttributes) {
      log.debug("UPDATE CART ITEM ATTRS", userId, teamId, cartItemId, cartItemAttributes);
      var ret = {
        update: null,
        success: null,
      };
      var cartItemLookup = {
        _id: cartItemId,
        teamId: teamId,
      };

      var cartItemUpdate = {};

      Object.keys(cartItemAttributes).forEach(function(key){
        if(APPROVED_CART_ITEM_ATTRS.hasOwnProperty(key) && APPROVED_CART_ITEM_ATTRS[key] === true){
          cartItemUpdate[key] = cartItemAttributes[key];
        }
      })

      if(cartItemAttributes.hasOwnProperty('status') === true){
        Object.keys(STATUS.CART_ITEM).forEach(function(statusKey) {
          if(cartItemAttributes.status === STATUS.CART_ITEM[statusKey]){
            cartItemUpdate.status = STATUS.CART_ITEM[statusKey]
          }
        })
      }

      if(cartItemAttributes.hasOwnProperty('productId') === true){
        var product = Products.findOne({_id: cartItemAttributes.productId});
        cartItemUpdate.productName = product.name
      }

      cartItemUpdate.updatedAt = (new Date()).toISOString();

      log.debug("UPDATE CART ITEM ACTUAL ATTRS", JSON.stringify(cartItemUpdate));

      ret.update = CartItems.update(cartItemLookup, {$set: cartItemUpdate});
      ret.success = true;

      return ret;
    },

    deleteCartItem: function(userId, teamId, cartItemId) {
      log.debug("DELETE CART ITEM", userId, teamId, cartItemId);
      var ret = {
        delete: null,
        success: null,
      };
      var cartItemLookup = {
        _id: cartItemId,
        teamId: teamId,
      };
      ret.delete = CartItems.update(cartItemLookup, {$set: {
        status: STATUS.CART_ITEM.DELETED,
        updatedAt: (new Date()).toISOString(),
        deletedAt: (new Date()).toISOString(),
        deletedBy: userId,
      }});
      ret.success = true;

      return ret;
    },

    getTeamCartItems: function(teamId) {
      const query = {
        teamId: teamId,
        status: STATUS.CART_ITEM.NEW,
      }
      const queryOptions = {}
      log.debug("Retrieving cart items, with query: ", query, " queryOptions: ", queryOptions);
      var teamCartItems = CartItems.find(query, queryOptions).fetch();
      log.debug("Found: ", teamCartItems.length, " team cart items");
      return teamCartItems;
    },

    updateCartItemProductDetails: function(cartItemsIds) {
      log.debug("UPDATING PRODUCT DETAILS FOR: ", cartItemsIds, " cart items");
      var cartItemsToUpdate = CartItems.find({_id: {$in: cartItemsIds}}).fetch()
      cartItemsToUpdate.forEach(function(cartItem) {
        var product = Products.findOne({_id: cartItem.productId})
        CartItems.update({_id: cartItem._id}, {
          $set: {
            productPrice: product.price,
            productName: product.name,
            updatedAt: (new Date()).toISOString(),
          }
        })
      })
    },

    sendCartItems: function(userId, teamId, orderPkg) {
      var ret = {
        success: false,
        orders: null
      }
      var team = Teams.findOne({_id: teamId}, {fields: {teamCode: 1}});
      // double check if cart has any items
      log.debug('\n\nSEND CART PARAMS - userId: ', userId, ' teamId: ', teamId, ' teamCode: ', team.teamCode, ' orderPkg: ', orderPkg, '\n\n');
      var purveyorIds = Object.keys(orderPkg)
      var pipeline = [
        { $match: {
            teamId: teamId,
            status: STATUS.CART_ITEM.NEW,
            purveyorId: {$in: purveyorIds},
        } },
        { $group : {
          _id: '$purveyorId',
          products: {
            $push: '$$ROOT'
          }
        } }
      ];
      var cartItems = CartItems.aggregate(pipeline);
      log.info('CART ITEMS: ', cartItems.length);

      // if the cart has orders
      if(cartItems.length > 0){
        ret.orders = {}

        // iterate over the orders, add an order for each purveyor
        cartItems.forEach(function(order){
          var purveyorId = order._id;
          var purveyor = Purveyors.findOne({_id: purveyorId});

          var cartItemsIds = order.products.map(function(cartItem){
            return cartItem._id
          });

          // Upsert order for send
          var orderId = null
          var purveyorOrderPkg = {}
          var orderDeliveryDate = null;
          if(orderPkg.hasOwnProperty(purveyorId) === true){
            purveyorOrderPkg = orderPkg[purveyorId]
            if(purveyorOrderPkg.hasOwnProperty('orderId') === true){
              orderId = purveyorOrderPkg.orderId;
            } else {
              // backward compatibility
              orderId = purveyorOrderPkg;
            }
            if(purveyorOrderPkg.hasOwnProperty('deliveryDate') === true){
              orderDeliveryDate = purveyorOrderPkg.deliveryDate;
            }
          }
          if(orderId === null){
            orderId = Orders._makeNewID();
          }
          var orderedAt = (new Date()).toISOString();

          var orderDetails = Object.assign({}, order)
          delete orderDetails.id

          Orders.update(
            { _id: orderId },
            {
              $set: {
                userId: userId,
                teamId: teamId,
                orderRef: Math.random().toString(36).replace(/[^a-z0-9]+/g, '').substr(1, 6).toUpperCase(),
                teamCode: team.teamCode,
                purveyorId: purveyorId,
                purveyorCode: purveyor.purveyorCode,
                orderDetails: orderDetails,
                orderedAt: orderedAt,
                orderDeliveryDate: orderDeliveryDate,
                total: 0.0,
                sent: null,
                tracked: null,
                confirm: {
                  confirmedAt: null,
                  userId: null,
                  order: false,
                  products:{},
                },
                error: null,
                mandrillResponse: null,
                updatedAt: (new Date()).toISOString(),
              },
              $setOnInsert: {
                _id: orderId,
                createdAt: (new Date()).toISOString(),
              }
            },
            { upsert: true }
          );
          // update the cartItems with the orderId
          CartItems.update({_id: {$in: cartItemsIds}}, {
            $set: {
              orderId: orderId,
              status: STATUS.CART_ITEM.ORDERED,
              updatedAt: (new Date()).toISOString(),
            }
          },{ multi:true })
          Meteor.call('updateCartItemProductDetails', cartItemsIds)

          // send the orders
          log.debug('INSERT: ', orderId);
          log.info("EXECUTE sendOrderCartItems with: ", orderId);
          ret.orders[orderId] = Meteor.call('sendOrderCartItems', orderId);

        }.bind(this));

        ret.success = true;

      } else {
        Meteor.call('triggerError',
          'technical-error:order',
          'Your cart is empty - please add items before submitting an order.',
          userId
        )
      }

      return ret;
    },

    sendOrderCartItems: function(orderId, debugMode) {
      if(undefined === debugMode){
        debugMode = false
      }
      var ret = {
        success: false
      }
      // real order id
      var realOrderId = {_id: orderId};
      log.debug('SEND ORDER - REAL ORDER ID: ', realOrderId);
      var order = Orders.findOne(realOrderId);

      if(!order){
        log.debug('SEND ORDER - CANNOT FIND ORDER: ', orderId);
        ret.success = false;
        return ret;
      }

      log.debug('ORDER OBJ: ', JSON.stringify(order));
      var user = Meteor.users.findOne({ _id: order.userId });

      // lookup BUYER info
      var team = Teams.findOne({ _id: order.teamId });
      // lookup PURVEYOR info
      var purveyor = Purveyors.findOne({ _id: order.purveyorId });
      try {

        // notify dj
        // slack.alert({
        //   channel: '@kahdojay',
        //   text: `<@kahdojay> order ${orderId} submitted for ${team.teamCode} by ${user.firstName} ${user.lastName} in ${Meteor.settings.APP.ENV}`,
        //   icon_emoji: ':moneybag:'
        // });

        if(purveyor.hasOwnProperty('sendEmail') === false || purveyor.sendEmail === false){
          log.error('Purveyor sendEmail is disabled or missing, triggering error for user: ', order.userId);
          return Meteor.call('triggerError',
            'send-order-error:send-disabled',
            `Error - ${purveyor.name} email invalid`,
            order.userId
          )
        }

        var showProductPrices = false
        if(
          team.hasOwnProperty('betaAccess') === true
          && team.betaAccess.hasOwnProperty('showProductPrices') === true
          && team.betaAccess.showProductPrices === true
        ){
          showProductPrices = true
        }

        // setup our buyer contact list
        var buyerContacts = []

        team.orderContacts.split(',').forEach(function(contact) {
          buyerContacts.push({ contactInfo: contact.trim() })
        })

        var teamCityStateZip = [];
        teamCityStateZip.push(team.city || '');
        teamCityStateZip.push(', ');
        teamCityStateZip.push(team.state || '');
        teamCityStateZip.push(' ');
        teamCityStateZip.push(team.zipCode || '');

        // get order date
        var timeZone = 'UTC';
        if(purveyor.hasOwnProperty('timeZone') && purveyor.timeZone){
          timeZone = purveyor.timeZone;
        }
        var orderDate = moment(order.orderedAt).tz(timeZone);
        var orderDeliveryDate = '';
        if(order.orderDeliveryDate){
          orderDeliveryDate = moment(order.orderDeliveryDate).tz(timeZone).format('dddd, MMMM D');
        }

        // setup the order product list
        var orderProductList = []
        var orderCartItems = CartItems.find({orderId: orderId}).fetch();

        // add the order products
        var idx = 0
        orderCartItems.forEach(function(cartItem){
          var product = Products.findOne({ _id: cartItem.productId });

          // add product to the order products list
          var productUnit = product.unit;
          if(cartItem.quantity > 1){
            if(product.unit == 'bunch'){
              productUnit += 'es';
            } else if(product.unit !== 'ea' && product.unit !== 'dozen' && product.unit !== 'cs'){
              productUnit += 's';
            }
          }
          orderProductListItem = {
            idx: idx,
            name: product.name || 'Product Name Error',
            sku: product.sku || '',
            quantity: cartItem.quantity * product.amount || 'Quantity Error',
            unit: productUnit,
            notes: product.description, // cartItem.notes,
            price: (product.price) ? '$' + s.numberFormat(parseFloat(product.price), 2) : '',
          }

          if(showProductPrices === true){
            orderProductListItem.showProductPrice = true
          } else {
            orderProductListItem.showProductPrice = false
          }

          orderProductList.push(orderProductListItem);

          idx++;
        })

        // setup the global merge vars
        var globalMergeVars = [];
        globalMergeVars.push({ name: 'PURVEYOR_NAME', content: purveyor.name });
        globalMergeVars.push({ name: 'BUYER_NAME', content: team.name });
        globalMergeVars.push({ name: 'BUYER_CONTACTS', content: buyerContacts });
        globalMergeVars.push({ name: 'BUYER_ADDRESS', content: team.address || '' });
        globalMergeVars.push({ name: 'BUYER_CITY_STATE_ZIP', content: teamCityStateZip.join('') });
        globalMergeVars.push({ name: 'ORDER_DATE', content: orderDate.format('dddd, MMMM D') });
        globalMergeVars.push({ name: 'ORDER_TIME', content: orderDate.format('h:mm A') });
        globalMergeVars.push({ name: 'DELIVERY_DATE', content: orderDeliveryDate });
        globalMergeVars.push({ name: 'CONTACT_MAILER', content: Meteor.settings.MANDRILL.CONTACT_MAILER });
        globalMergeVars.push({ name: 'ORDER_DELIVERY_INSTRUCTIONS', content: (order.deliveryInstruction ? order.deliveryInstruction : false) });
        globalMergeVars.push({ name: 'ORDER_PRODUCTS', content: orderProductList });
        globalMergeVars.push({ name: 'SHOW_PRODUCT_PRICES', content: showProductPrices });

        log.info("PROCESSING ORDER: ", orderId);
        log.debug("GLOBAL MERGE VARS: ", JSON.stringify(globalMergeVars));

        var purveyorSendFax = false
        if(purveyor.hasOwnProperty('sendFax') === true && purveyor.sendFax === true){
          purveyorSendFax = true
          var faxText = []
          faxText.push(`Order Submission From: ${team.name}`)
          faxText.push(`Order Date: ${orderDate.format('dddd, MMMM D')}`)
          faxText.push(`Order Time: ${orderDate.format('h:mm A')}`)
          faxText.push('')
          faxText.push(`PLEASE EMAIL orders@sousapp.com OR CALL DON AT 530.435.5246 TO CONFIRM RECEIPT`)
          faxText.push('')
          faxText.push('------Buyer Contacts------')
          buyerContacts.forEach(function(contact) {
            faxText.push(contact.contactInfo)
          })
          faxText.push('')
          faxText.push('------Customer Address------')
          faxText.push(team.address)
          faxText.push(teamCityStateZip.join(''))
          faxText.push('')
          faxText.push('------Order Summary------')
          orderProductList.forEach(function(product) {
            faxText.push(`${product.name}${product.sku ? ' (' + product.sku + ') ': ''} - ${product.quantity} ${product.unit}`)
            faxText.push('')
          })
          faxText.push(`PLEASE EMAIL orders@sousapp.com CALL DON AT 530.435.5246 TO CONFIRM RECEIPT`)

          var faxOptions = {
            number: purveyor.fax,
            text: faxText.join('\n')
          }
          Meteor.call('faxOrder', faxOptions)
        }

        if(purveyor.hasOwnProperty('uploadToFTP') === true && purveyor.uploadToFTP === true){
          var teamPurveyorSettingsLookup = {teamId: team._id, purveyorId: purveyor._id};
          log.debug('TEAM PURVEYOR SETTINGS LOOKUP: ', teamPurveyorSettingsLookup);
          var teamPurveyorSettings = TeamPurveyorSettings.findOne(teamPurveyorSettingsLookup);
          Meteor.call('uploadOrderToFtp', {
            teamPurveyorSettings: teamPurveyorSettings,
            orderId: orderId,
            orderRef: order.orderRef,
            orderDate: orderDate,
            orderProductList: orderProductList,
          })
        }

        if(debugMode === true){
          log.debug('\n\n')
          log.debug('=======================================\nDEBUG MODE ONLY, NOTHING WAS SENT!!!\n=======================================')
          log.debug('\n\n')
          return;
        }
        /* */
        // send order email
        // tutorial/source:
        //  - https://github.com/Wylio/meteor-mandrill/
        //  - http://dev4devs.com/2015/06/05/meteor-js-how-to-do-to-send-e-mail-with-a-mandrill-account/
        //  - http://kbcdn.mandrill.com/handlebars-example-sendtemplate-api.txt


        // this.unblock(); // http://docs.meteor.com/#/full/method_unblock
        // send the template

        let recipients = [
          {
            email: 'dj@sousapp.com',
            type: 'bcc'
          },
          {
            email: 'brian@sousapp.com',
            type: 'bcc'
          }
        ]
        // if(user.email){
        //   recipients.push({
        //     email: user.email.trim(),
        //     type: 'cc'
        //   })
        // }
        purveyor.orderEmails.split(',').forEach(function(orderEmail) {
          log.info('adding purveyor orderEmail to recipients TO array: ', orderEmail)
          orderEmail = orderEmail.trim()
          if(orderEmail){
            recipients.push({
              email: orderEmail,
              type: 'to'
            })
          }
        })
        if(team.orderEmails){
          team.orderEmails.split(',').forEach(function(orderEmail) {
            var recipientEmails = recipients.map(function(r) { return r.email })
            if(recipientEmails.indexOf(orderEmail.trim()) === -1){
              log.info('adding orderEmail to recipients CC array: ', orderEmail)
              orderEmail = orderEmail.trim()
              if(orderEmail){
                recipients.push({
                  email: orderEmail,
                  type: 'cc'
                })
              }
            }
          })
        }


        var templateName = Meteor.settings.MANDRILL.TEMPLATES.SEND_ORDER
        if(team.demoTeam){
          templateName = Meteor.settings.MANDRILL.TEMPLATES.SEND_DEMO_ORDER
        }

        log.info('SENDING EMAIL to recipients: ', recipients, ' using template: ', templateName)

        Mandrill.messages.sendTemplate({
          template_name: templateName,
          template_content: [],
          from_name: 'Sous',
          message: {
            to: recipients,
            auto_text: true,
            inline_css: true,
            merge: true,
            merge_language: "handlebars",
            global_merge_vars: globalMergeVars
          }
        }, function(err, responseData){
          log.debug("MANDRILL RESPONSE: ", err, responseData);
          // notify Slack of order send success/failure
          if(err){
            if(Meteor.call('sendSlackNotification', order.teamId)){
              const slackAttachments = [
                {
                  title: 'Errant Order Details',
                  color: 'danger',
                  fields: [
                    {
                      title: 'Team Name',
                      value: team.name,
                      short: true
                    },
                    {
                      title: 'Purveyor',
                      value: purveyor.name,
                      short: true
                    },
                    {
                      title: 'orderId',
                      value: orderId,
                      short: true
                    },
                    {
                      title: 'Error',
                      value: err.message,
                      short: true
                    },
                  ]
                }
              ]
              slack.alert({
                username: 'Orderbot (mobile)',
                  channel: '#dev-errors',
                text: '<!channel> Mandrill Order Error!',
                attachments: slackAttachments
              });
            }
            Meteor.call('triggerError',
              'technical-error:email',
              'Order Send Error - Sous has been notified, please send this order to your purveyors directly. Access your order from "Receiving Guide" and click the email icon to resend.',
              order.userId
            )

            var purveyorName = Purveyors.findOne({_id: order.purveyorId}).name
            var messageAttributes = {
                type: 'error',
                message: `Order Error: ${purveyorName} - please resend order from "Receiving Guide" and click the email icon to resend.`,
                author: 'Sous',
                teamId: order.teamId,
                createdAt: (new Date()).toISOString(),
                imageUrl: 'https://sous-assets-production.s3.amazonaws.com/uploads/89b217dc-4ec5-43e8-9569-8fc85e6fdd52/New+Sous+Logo+Circle+Small.png',
                userId: user._id,
              }
            // TODO: Refactor to use common message library
            Messages.insert(messageAttributes);
            var message = messageAttributes.message
            Meteor.call('triggerPushNotification', message, messageAttributes.teamId, messageAttributes.userId)

            // Update order error
            Orders.update(realOrderId, { $set: {
              sent: false,
              tracked: false,
              error: true,
              mandrillResponse: responseData,
              updatedAt: (new Date()).toISOString(),
            }});
          } else {
            // notify team in Sous App
            var messageAttributes = {
                purveyorId: order.purveyorId,
                purveyor: Purveyors.findOne({_id: order.purveyorId}).name,
                type: 'order',
                author: 'Sous',
                teamId: order.teamId,
                orderId: orderId,
                createdAt: (new Date()).toISOString(),
                imageUrl: 'https://sous-assets-production.s3.amazonaws.com/uploads/89b217dc-4ec5-43e8-9569-8fc85e6fdd52/New+Sous+Logo+Circle+Small.png',
                userId: user._id,
              }
            // TODO: Refactor to use common message library
            Messages.insert(messageAttributes);
            var message = `Order sent to ${messageAttributes.purveyor}`
            Meteor.call('triggerPushNotification', message, messageAttributes.teamId, messageAttributes.userId)
            // track in mixpanel

            var mixpanelEventName = `Place order [${Meteor.settings.APP.ENV}]`
            if(
              ['DEMO', 'DEV', 'MAGGIESDEMO', 'SEANSDEMO'].indexOf(order.teamCode) !== -1
              // || order.teamCode.indexOf('DEMO') !== -1
            ){
              mixpanelEventName = `Place order [${Meteor.settings.APP.ENV}] (DEMO)`
            }

            log.debug('SEND MIXPANEL EVENT: ', mixpanelEventName)
            mixpanel.track(mixpanelEventName, {
              distinct_id: user._id,
              sender: `${user.firstName} ${user.lastName}`,
              orderId: orderId,
              orderDeliveryDate: orderDeliveryDate,
              orderProductCount: Object.keys(order.orderDetails.products).length,
              showProductPrices: showProductPrices,
              orderSubTotal: order.subtotal || '',
              orderedAt: order.orderedAt,
              orderDateTimeZone: orderDate.format('dddd, MMMM D h:mm A'),
              orderType: 'mobile',
              teamId: order.teamId,
              teamCode: order.teamCode,
              purveyorId: order.purveyorId,
              purveyor: purveyor.name,
              purveyorSendFax: purveyorSendFax,
              serverEnvironment: Meteor.settings.APP.ENV,
            })

            // notify Sous team in Slack
            if (Meteor.call('sendSlackNotification', messageAttributes.teamId)) {
              const slackAttachments = [
                {
                  title: 'Order Details',
                  color: 'good',
                  fields: [
                    {
                      title: 'orderId',
                      value: orderId
                    },
                    {
                      title: 'teamCode',
                      value: order.teamCode,
                      short: true
                    },
                    {
                      title: 'Purveyor',
                      value: purveyor.name,
                      short: true
                    },
                    {
                      title: 'Sender',
                      value: `${user.firstName} ${user.lastName}`,
                      short: true
                    },
                    {
                      title: 'Product Count (orderDetails)',
                      value: Object.keys(order.orderDetails.products).length
                    }
                  ]
                }
              ]

              slack.alert({
                username: 'Orderbot (mobile)',
                channel: '#orders',
                text: `<!channel> ${team.name} ordered $${order.subtotal || ''} from ${purveyor.name}`,
                icon_emoji: ':moneybag:',
                attachments: slackAttachments
              });
            }
            // Update order sent
            Orders.update(realOrderId, { $set: {
              sent: true,
              tracked: true,
              error: false,
              mandrillResponse: responseData,
              updatedAt: (new Date()).toISOString(),
            }});
            log.debug("ORDER SENT...", orderId)
          }
        }.bind(this));

        ret.success = true;
      } catch (err) {
        ret.success = false;
        var slackAttachments = [
          {
            title: 'Errant Order Details',
            color: 'danger',
            fields: [
              {
                title: 'Team Name',
                value: team.name,
                short: true
              },
              {
                title: 'Team Code',
                value: team.teamCode,
                short: true
              },
              {
                title: 'Purveyor',
                value: purveyor.name,
                short: true
              },
              {
                title: 'orderId',
                value: orderId,
                short: true
              },
            ]
          }
        ]

        var alertMsg = []
        alertMsg.push('<!channel> Meteor Order Error!');
        alertMsg.push('');
        alertMsg.push('*Error*');
        alertMsg.push(`${err}`);
        alertMsg.push('');
        alertMsg.push('*Line Number*');
        alertMsg.push(err.lineNumber || '`<unkown>`');
        alertMsg.push('');
        alertMsg.push('*Stack Trace*');
        alertMsg.push((err.stack) ? '```'+err.stack+'```' : '`...`');
        alertMsg.push('');

        slack.alert({
          username: 'Orderbot (mobile)',
          channel: '#dev-errors',
          text: alertMsg.join('\n'),
          icon_emoji: ':rotating_light:',
          attachments: slackAttachments
        });

        log.error(alertMsg.join('\n'), slackAttachments)
      }

      return ret;
    },

    // sendCart: function(userId, teamId, teamOrderId) {
    //   var ret = {
    //     success: false,
    //     teamOrderId: null,
    //     orders: null
    //   }
    //   // double check if cart has any items
    //   var realTeamId = {_id: teamId}
    //   log.debug('SEND CART PARAMS ', userId, teamId, teamOrderId);
    //   var team = Teams.findOne(realTeamId, {cart: 1});
    //   log.info('TEAM CART ', team.cart);
    //   var teamCart = team.cart;
    //
    //   // if the cart has orders
    //   if(Object.keys(teamCart.orders).length > 0){
    //     ret.teamOrderId = teamOrderId
    //     ret.orders = {}
    //
    //     // <team>
    //     // {
    //     //   "_id": "tEtyZToEKuAeYs8NX",       // teamId
    //     //   "cart": {
    //     //     "date": 1445226109438,
    //     //     "total": 0,
    //     //     "orders": {
    //     //       "k458EQKzDH4y5tvFQ": {       // purveyorId
    //     //         "total": 0,
    //     //         "deliveryInstruction": "",
    //     //         "products": {
    //     //           "fuhw5ySv2KZhiNfWL": {   // productId
    //     //             "quantity": 3,
    //     //             "note": ""
    //     //           }
    //     //         }
    //     //       }
    //     //     }
    //     //   }
    //     // }
    //
    //     // iterate over the orders, add an order for each purveyor
    //     Object.keys(teamCart.orders).forEach(function(purveyorId){
    //       var order = teamCart.orders[purveyorId];
    //       var purveyor = Purveyors.findOne({_id: purveyorId});
    //
    //       // Insert order for send
    //       var orderId = order.id;
    //       var orderedAt = (new Date()).toISOString();
    //       var orderDetails = Object.assign({}, order)
    //       delete orderDetails.id
    //       Orders.update(
    //         { _id: orderId },
    //         {
    //           $set: {
    //             userId: userId,
    //             teamId: teamId,
    //             teamCode: team.teamCode,
    //             teamOrderId: teamOrderId,
    //             orderedAt: orderedAt,
    //             purveyorId: purveyorId,
    //             purveyorCode: purveyor.purveyorCode,
    //             orderDetails: orderDetails,
    //             confirm: {
    //               confirmedAt: null,
    //               userId: null,
    //               order: false,
    //               products: {}
    //             },
    //             sent: null,
    //             error: null,
    //             mandrillResponse: null,
    //             updatedAt: (new Date()).toISOString(),
    //           },
    //           $setOnInsert: {
    //             _id: orderId,
    //             createdAt: teamCart.date,
    //           }
    //         },
    //         { upsert: true }
    //       );
    //
    //       // update the team orders
    //       Teams.update(realTeamId, {
    //         $push: {
    //           orders: { id: orderId, sent: false, error: false, orderedAt: orderedAt }
    //         },
    //         $set: {
    //           updatedAt: (new Date()).toISOString(),
    //         }
    //       });
    //
    //       // send the orders
    //       log.debug('INSERT: ', orderId);
    //       log.info("EXECUTE sendOrder with: ", orderId);
    //       ret.orders[orderId] = Meteor.call('sendOrder', orderId);
    //
    //       // if(orderSent.status === STATUS.ORDER.SENT){
    //       //   // remove from the cart
    //       // }
    //
    //     }.bind(this));
    //
    //     // TODO: this shouldnt clear the cart if all the orders were not sent successfully
    //     // TODO: it should only leave unsent orders in the cart (remove the ones that were sent successfully)
    //     // if(Object.keys(team.orders).length === 0){
    //       // reset the team cart
    //       Teams.update(realTeamId, {
    //         $set: {
    //           cart: EMPTY_CART,
    //           updatedAt: (new Date()).toISOString(),
    //         }
    //       });
    //     // }
    //
    //     ret.success = true;
    //
    //   } else {
    //     Meteor.call('triggerError',
    //       'technical-error:order',
    //       'Your cart is empty - please add items before submitting an order.',
    //       userId
    //     )
    //   }
    //
    //   return ret;
    // },
    //
    // sendOrder: function(orderId) {
    //   // notify dj
    //   // slack.alert({
    //   //   channel: '@kahdojay',
    //   //   text: `<@kahdojay> order ${orderId} submitted`,
    //   //   icon_emoji: ':moneybag:'
    //   // });
    //   var ret = {
    //     success: false
    //   }
    //   // real order id
    //   var realOrderId = {_id: orderId};
    //
    //   var order = Orders.findOne(realOrderId);
    //   log.debug('SEND ORDER - REAL ORDER ID: ', realOrderId);
    //   log.debug('ORDER OBJ: ', JSON.stringify(order));
    //
    //   // lookup PURVEYOR info
    //   var purveyor = Purveyors.findOne({ _id: order.purveyorId });
    //
    //   if(purveyor.hasOwnProperty('sendEmail') === false || purveyor.sendEmail === false){
    //     log.error('Purveyor sendEmail is disabled or missing, triggering error for user: ', order.userId);
    //     return Meteor.call('triggerError',
    //       'send-order-error:send-disabled',
    //       `Error - ${purveyor.name} email invalid`,
    //       order.userId
    //     )
    //   }
    //
    //   // lookup BUYER info
    //   var team = Teams.findOne({ _id: order.teamId });
    //   var user = Meteor.users.findOne({ _id: order.userId });
    //
    //   // setup our buyer contact list
    //   var buyerContacts = []
    //
    //   team.orderContacts.split(',').forEach(function(contact) {
    //     buyerContacts.push({ contactInfo: contact.trim() })
    //   })
    //
    //   var teamCityStateZip = [];
    //   teamCityStateZip.push(team.city || '');
    //   teamCityStateZip.push(', ');
    //   teamCityStateZip.push(team.state || '');
    //   teamCityStateZip.push(' ');
    //   teamCityStateZip.push(team.zipCode || '');
    //
    //   // get order date
    //   var timeZone = 'UTC';
    //   if(purveyor.hasOwnProperty('timeZone') && purveyor.timeZone){
    //     timeZone = purveyor.timeZone;
    //   }
    //   var orderDate = moment(order.orderedAt).tz(timeZone);
    //
    //   // setup the order product list
    //   var orderProductList = [];
    //
    //   // add the order products
    //   var idx = 0
    //   Object.keys(order.orderDetails.products).forEach(function(productId){
    //     var product = Products.findOne({ _id: productId });
    //     var productOrderDetails = order.orderDetails.products[productId];
    //
    //     // add product to the order products list
    //     // TODO: validate product fields name/quantity/unit, else triggerError()
    //     var productUnit = product.unit;
    //     if(productOrderDetails.quantity > 1){
    //       if(product.unit == 'bunch'){
    //         productUnit += 'es';
    //       } else if(product.unit !== 'ea' && product.unit !== 'dozen' && product.unit !== 'cs'){
    //         productUnit += 's';
    //       }
    //     }
    //     orderProductList.push({
    //       idx: idx,
    //       name: product.name || 'Product Name Error',
    //       sku: product.sku || '',
    //       quantity: productOrderDetails.quantity * product.amount || 'Quantity Error',
    //       unit: productUnit,
    //       notes: productOrderDetails.notes
    //     });
    //     idx++;
    //   })
    //
    //   // setup the global merge vars
    //   var globalMergeVars = [];
    //   globalMergeVars.push({ name: 'PURVEYOR_NAME', content: purveyor.name });
    //   globalMergeVars.push({ name: 'BUYER_NAME', content: team.name });
    //   globalMergeVars.push({ name: 'BUYER_CONTACTS', content: buyerContacts });
    //   globalMergeVars.push({ name: 'BUYER_ADDRESS', content: team.address || '' });
    //   globalMergeVars.push({ name: 'BUYER_CITY_STATE_ZIP', content: teamCityStateZip.join('') });
    //   globalMergeVars.push({ name: 'ORDER_DATE', content: orderDate.format('dddd, MMMM D') });
    //   globalMergeVars.push({ name: 'ORDER_TIME', content: orderDate.format('h:mm A') });
    //   globalMergeVars.push({ name: 'CONTACT_MAILER', content: Meteor.settings.MANDRILL.CONTACT_MAILER });
    //   globalMergeVars.push({ name: 'ORDER_DELIVERY_INSTRUCTIONS', content: (order.deliveryInstruction ? order.deliveryInstruction : false) });
    //   globalMergeVars.push({ name: 'ORDER_PRODUCTS', content: orderProductList });
    //
    //   log.info("PROCESSING ORDER: ", orderId);
    //   log.debug("GLOBAL MERGE VARS: ", JSON.stringify(globalMergeVars));
    //
    //   if(purveyor.hasOwnProperty('sendFax') === true && purveyor.hasOwnProperty('sendFax') === true){
    //     var faxText = []
    //     faxText.push(`Order Submission From: ${team.name}`)
    //     faxText.push(`Order Date: ${orderDate.format('dddd, MMMM D')}`)
    //     faxText.push(`Order Time: ${orderDate.format('h:mm A')}`)
    //     faxText.push('')
    //     faxText.push(`PLEASE CALL DON AT 530.435.5246 TO CONFIRM RECEIPT`)
    //     faxText.push('')
    //     faxText.push('------Buyer Contacts------')
    //     buyerContacts.forEach(function(contact) {
    //       faxText.push(contact.contactInfo)
    //     })
    //     faxText.push('')
    //     faxText.push('------Customer Address------')
    //     faxText.push(team.address)
    //     faxText.push(teamCityStateZip.join(''))
    //     faxText.push('')
    //     faxText.push('------Order Summary------')
    //     orderProductList.forEach(function(product) {
    //       faxText.push(`${product.name}${product.sku ? ' (' + product.sku + ') ': ''} - ${product.quantity} ${product.unit}`)
    //       faxText.push('')
    //     })
    //     faxText.push(`PLEASE CALL DON AT 530.435.5246 TO CONFIRM RECEIPT`)
    //
    //     var faxOptions = {
    //       number: purveyor.fax,
    //       text: faxText.join('\n')
    //     }
    //     Meteor.call('faxOrder', faxOptions)
    //   }
    //
    //   /* */
    //   // send order email
    //   // tutorial/source:
    //   //  - https://github.com/Wylio/meteor-mandrill/
    //   //  - http://dev4devs.com/2015/06/05/meteor-js-how-to-do-to-send-e-mail-with-a-mandrill-account/
    //   //  - http://kbcdn.mandrill.com/handlebars-example-sendtemplate-api.txt
    //
    //
    //   // this.unblock(); // http://docs.meteor.com/#/full/method_unblock
    //   // send the template
    //
    //   let recipients = [
    //     {
    //       email: 'dj@sousapp.com',
    //       type: 'bcc'
    //     },
    //     {
    //       email: 'brian@sousapp.com',
    //       type: 'bcc'
    //     }
    //   ]
    //   // if(user.email){
    //   //   recipients.push({
    //   //     email: user.email.trim(),
    //   //     type: 'cc'
    //   //   })
    //   // }
    //   purveyor.orderEmails.split(',').forEach(function(orderEmail) {
    //     log.info('adding purveyor orderEmail to recipients TO array: ', orderEmail)
    //     recipients.push({
    //       email: orderEmail.trim(),
    //       type: 'to'
    //     })
    //   })
    //   team.orderEmails.split(',').forEach(function(orderEmail) {
    //     var recipientEmails = recipients.map(function(r) { return r.email })
    //     if(recipientEmails.indexOf(orderEmail.trim()) === -1){
    //       log.info('adding orderEmail to recipients CC array: ', orderEmail)
    //       recipients.push({
    //         email: orderEmail.trim(),
    //         type: 'cc'
    //       })
    //     }
    //   })
    //   log.info('sending email to recipients: ', recipients)
    //   Mandrill.messages.sendTemplate({
    //     template_name: Meteor.settings.MANDRILL.TEMPLATES.SEND_ORDER,
    //     template_content: [],
    //     from_name: 'Sous',
    //     message: {
    //       to: recipients,
    //       auto_text: true,
    //       inline_css: true,
    //       merge: true,
    //       merge_language: "handlebars",
    //       global_merge_vars: globalMergeVars
    //     }
    //   }, function(err, responseData){
    //     log.debug("MANDRILL RESPONSE: ", err, responseData);
    //     // notify Slack of order send success/failure
    //     if(err){
    //       const slackAttachments = [
    //         {
    //           title: 'Errant Order Details',
    //           color: 'danger',
    //           fields: [
    //             {
    //               title: 'Team Name',
    //               value: team.name,
    //               short: true
    //             },
    //             {
    //               title: 'Purveyor',
    //               value: purveyor.name,
    //               short: true
    //             },
    //             {
    //               title: 'orderId',
    //               value: orderId,
    //               short: true
    //             },
    //             {
    //               title: 'Error',
    //               value: err.message,
    //               short: true
    //             },
    //           ]
    //         }
    //       ]
    //       slack.alert({
    //         username: 'Orderbot (mobile)',
    //         channel: '#dev-errors',
    //         text: '<!channel> Mandrill Order Error!',
    //         attachments: slackAttachments
    //       });
    //       Meteor.call('triggerError',
    //         'technical-error:email',
    //         'Order Send Error - Sous has been notified, please send this order to your purveyors directly. Access your order from "Receiving Guide" and click the email icon to resend.',
    //         order.userId
    //       )
    //
    //       var purveyorName = Purveyors.findOne({_id: order.purveyorId}).name
    //       var messageAttributes = {
    //           type: 'error',
    //           message: `Order Error: ${purveyorName} - please resend order from "Receiving Guide" and click the email icon to resend.`,
    //           author: 'Sous',
    //           teamId: order.teamId,
    //           createdAt: (new Date()).toISOString(),
    //           imageUrl: 'https://sous-assets-production.s3.amazonaws.com/uploads/89b217dc-4ec5-43e8-9569-8fc85e6fdd52/New+Sous+Logo+Circle+Small.png',
    //           userId: user._id,
    //         }
    //       // TODO: Refactor to use common message library
    //       Messages.insert(messageAttributes);
    //       var message = messageAttributes.message
    //       Meteor.call('triggerPushNotification', message, messageAttributes.teamId, messageAttributes.userId)
    //
    //       // Update order error
    //       Orders.update(realOrderId, { $set: {
    //         sent: false,
    //         error: true,
    //         mandrillResponse: responseData,
    //         updatedAt: (new Date()).toISOString(),
    //       }});
    //       // update the team orders
    //       Teams.update({_id: order.teamId, "orders.id": order.id}, {
    //         $set: {
    //           orders: { sent: false, error: true },
    //           updatedAt: (new Date()).toISOString(),
    //         }
    //       });
    //       ret.success = false;
    //     } else {
    //       // notify team in Sous App
    //       var messageAttributes = {
    //           purveyorId: order.purveyorId,
    //           purveyor: Purveyors.findOne({_id: order.purveyorId}).name,
    //           type: 'order',
    //           author: 'Sous',
    //           teamId: order.teamId,
    //           orderId: orderId,
    //           createdAt: (new Date()).toISOString(),
    //           imageUrl: 'https://sous-assets-production.s3.amazonaws.com/uploads/89b217dc-4ec5-43e8-9569-8fc85e6fdd52/New+Sous+Logo+Circle+Small.png',
    //           userId: user._id,
    //         }
    //       // TODO: Refactor to use common message library
    //       Messages.insert(messageAttributes);
    //       var message = `Order sent to ${messageAttributes.purveyor}`
    //       Meteor.call('triggerPushNotification', message, messageAttributes.teamId, messageAttributes.userId)
    //       if (Meteor.call('sendSlackNotification', messageAttributes.teamId)) {
    //         // notify Sous team in Slack
    //         const slackAttachments = [
    //           {
    //             title: 'Order Details',
    //             color: 'good',
    //             fields: [
    //               {
    //                 title: 'orderId',
    //                 value: orderId
    //               },
    //               {
    //                 title: 'Team Code',
    //                 value: order.teamCode,
    //                 short: true
    //               },
    //               {
    //                 title: 'Purveyor',
    //                 value: purveyor.name,
    //                 short: true
    //               },
    //               {
    //                 title: 'Sender',
    //                 value: `${user.firstName} ${user.lastName}`,
    //                 short: true
    //               },
    //               {
    //                 title: 'Product Count (orderDetails)',
    //                 value: Object.keys(order.orderDetails.products).length
    //               },
    //             ]
    //           }
    //         ]
    //
    //         slack.alert({
    //           username: 'Orderbot (mobile)',
    //           channel: '#orders',
    //           text: `<!channel> ${team.name} ordered $${order.subtotal || ''} from ${purveyor.name}`,
    //           icon_emoji: ':moneybag:',
    //           attachments: slackAttachments
    //         });
    //       }
    //       // Update order sent
    //       Orders.update(realOrderId, { $set: {
    //         sent: true,
    //         error: false,
    //         mandrillResponse: responseData,
    //         updatedAt: (new Date()).toISOString(),
    //       }});
    //       // update the team orders
    //       Teams.update({_id: order.teamId, "orders.id": order.id}, {
    //         $set: {
    //           orders: { sent: true, error: false },
    //           updatedAt: (new Date()).toISOString(),
    //         }
    //       });
    //       ret.success = true;
    //       log.debug("ORDER SENT...", orderId)
    //     }
    //   }.bind(this));
    //
    //   return ret;
    // },

    updateOrder: function(userId, orderId, orderAttributes) {
      log.debug("UPDATE ORDER ATTRS", JSON.stringify(orderAttributes));
      var realOrderId = {_id: orderId};
      orderAttributes.updatedAt = (new Date()).toISOString();
      return Orders.update(realOrderId, {$set: orderAttributes});
    },
  })

}
