if(Meteor.isServer){
  Meteor.methods({

    trackOldOrders: function() {

      var allUntrackedOrders = Orders.find({tracked: {$exists: false}, orderedAt: {$lt: moment().subtract(5, 'days').toISOString()}},{limit: 500}).fetch();

      if(allUntrackedOrders.length > 0){
        // var batch = []

        var mixpanel_importer = Mixpanel.init(Meteor.settings.MIXPANEL.TOKEN, {
          key: Meteor.settings.MIXPANEL.KEY
        });

        allUntrackedOrders.forEach(function(order) {
          var orderId = order._id;

          var user = Meteor.users.findOne({ _id: order.userId });

          // lookup BUYER info
          var team = Teams.findOne({ _id: order.teamId });
          // lookup PURVEYOR info
          var purveyor = Purveyors.findOne({ _id: order.purveyorId });

          var showProductPrices = false
          if(
            team.hasOwnProperty('betaAccess') === true
            && team.betaAccess.hasOwnProperty('showProductPrices') === true
            && team.betaAccess.showProductPrices === true
          ){
            showProductPrices = true
          }

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

          var purveyorSendFax = false
          if(purveyor.hasOwnProperty('sendFax') === true && purveyor.sendFax === true){
            purveyorSendFax = true
          }

          var mixpanelEventName = `Place order [${Meteor.settings.APP.ENV}]`
          if(
            ['DEMO', 'DEV', 'MAGGIESDEMO', 'SEANSDEMO'].indexOf(order.teamCode) !== -1
            // || order.teamCode.indexOf('DEMO') !== -1
          ){
            mixpanelEventName = `Place order [${Meteor.settings.APP.ENV}] (DEMO)`
          }

          var trackAttributes = {
            distinct_id: user._id,
            sender: `${user.firstName} ${user.lastName}`,
            orderId: orderId,
            orderRef: order.orderRef,
            orderDeliveryDate: orderDeliveryDate,
            orderProductCount: orderProductCount,
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
          }

          // batch.push({
          //   event: mixpanelEventName,
          //   properties: trackAttributes
          // })

          log.debug('SEND MIXPANEL EVENT: ', mixpanelEventName, orderDate.toDate(), trackAttributes)
          mixpanel_importer.import(mixpanelEventName, orderDate.toDate(), trackAttributes)
          Orders.update({_id: order._id},{$set:{tracked: true}})
        });


        // mixpanel_importer.import_batch(batch);
        // log.debug('TRACKED OLD ORDERS: ', batch)
      } else {
        log.debug('TRACKED OLD ORDERS: no order left to back track.')
      }


    },

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
      var updateOptions = {};

      if(cartItem === undefined && cartItemAttributes.hasOwnProperty('_id') === true){
        cartItemLookup = {_id: cartItemAttributes._id};
        cartItem = CartItems.findOne(cartItemLookup);
      }

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

        // var cartItemStatusLookup = Object.keys(STATUS.CART_ITEM)
        // if(cartItemAttributes.hasOwnProperty('status') === true && cartItemStatusLookup.indexOf(cartItemAttributes.status) !== -1){
        //   cartItemUpsert.status = cartItemAttributes.status;
        // } else {
          cartItemUpsert.status = STATUS.CART_ITEM.NEW;
        // }

        if(cartItemAttributes.hasOwnProperty('orderId') === true){
          cartItemUpsert.orderId = cartItemAttributes.orderId;
        } else {
          cartItemUpsert.orderId = null;
        }
        updateOptions = {upsert: true}
      } else {
        log.debug("CART ITEM FOUND, UPDATING...")
        // update attributes
        cartItemLookup = {_id: cartItem._id}
        cartItemUpsert = {$set: {
          quantity: cartItemAttributes.quantity,
          status: STATUS.CART_ITEM.NEW,
          note: cartItemAttributes.note,
          updatedAt: (new Date()).toISOString(),
        }}
      }

      ret.upsert = CartItems.update(cartItemLookup, cartItemUpsert, updateOptions);
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
        });
      })
    },

    verifyCartItems: function(userId, teamId, orderPkg) {
      var ret = {
        verified: true,
        unverifiedCartItems: {},
      }
      var team = Teams.findOne({_id: teamId}, {fields: {teamCode: 1}});
      // double check if cart has any items
      log.debug('\n\nVERIFY CART ITEMS PARAMS - userId: ', userId, ' teamId: ', teamId, ' teamCode: ', team.teamCode, ' orderPkg: ', orderPkg, '\n\n');
      var purveyorIds = Object.keys(orderPkg)

      purveyorIds.forEach(function(purveyorId){
        var cartItems = CartItems.find({
          teamId: teamId,
          status: STATUS.CART_ITEM.NEW,
          purveyorId: purveyorId,
        }, {fields: {_id: 1, quantity: 1, productName: 1}}).fetch();
        var cartItemIds = [];
        var serverCartItem = {};
        cartItems.forEach(function(cartItem) {
          cartItemIds.push(cartItem._id)
          serverCartItem[cartItem._id] = {
            quantity: cartItem.quantity,
            productName: cartItem.productName,
          }
          return cartItem._id;
        })
        log.debug('VERIFY CART ITEMS: found: ', serverCartItem, ' - comparing to: ', orderPkg[purveyorId].cartItemIds)
        var unverifiedCartItems = []
        orderPkg[purveyorId].cartItemIds.forEach(function(cartItem) {
          if(
            cartItemIds.indexOf(cartItem.id) === -1  // not found
            || serverCartItem[cartItem.id].quantity !== cartItem.quantity
          ){
            unverifiedCartItems.push(cartItem)
          } else if(serverCartItem[cartItem.id].productName !== cartItem.productName){
            Meteor.call('updateProduct', productId, {name: serverCartItem[cartItem.id].productName});
            CartItems.update({_id: cartItem.id}, {
              $set: {
                productName: product.name,
                updatedAt: (new Date()).toISOString(),
              }
            });
          }
        })
        if(unverifiedCartItems.length > 0){
          ret.verified = false
          ret.unverifiedCartItems[purveyorId] = unverifiedCartItems
        }
      })

      return ret;
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
          let firstName = Meteor.users.findOne({_id: userId}).firstName || 'Sous'
          let orderCommentText = cartItemsIds.length > 1 ? `Order placed - ${cartItemsIds.length} items.` : `Order placed - ${cartItemsIds.length} item.`
          Orders.update(
            { _id: orderId },
            {
              $set: {
                userId: userId,
                teamId: teamId,
                orderRef: Math.random().toString(36).replace(/[^a-z0-9]+/g, '').substr(1, 4).toUpperCase(),
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
                comments: [{
                  author: firstName,
                  createdAt: new Date().toISOString(),
                  text: orderCommentText
                }],
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
        if(purveyor.hasOwnProperty('sendEmail') === false || purveyor.sendEmail === false){
          log.error('Purveyor sendEmail is disabled or missing, triggering error for user: ', order.userId);
          return Meteor.call('triggerError',
            'send-order-error:send-disabled',
            `Error - please check email settings for ${purveyor.name}`,
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

        // setup the global merge vars for Mandrill
        var globalMergeVars = [];
        globalMergeVars.push({ name: 'PURVEYOR_NAME', content: purveyor.name });
        globalMergeVars.push({ name: 'BUYER_NAME', content: team.name });
        globalMergeVars.push({ name: 'BUYER_CONTACTS', content: buyerContacts });
        globalMergeVars.push({ name: 'BUYER_ADDRESS', content: team.address || '' });
        globalMergeVars.push({ name: 'BUYER_CITY_STATE_ZIP', content: teamCityStateZip.join('') });
        globalMergeVars.push({ name: 'ORDER_REF', content: order.orderRef || '' });
        globalMergeVars.push({ name: 'ORDER_DATE', content: orderDate.format('dddd, MMMM D') });
        globalMergeVars.push({ name: 'ORDER_TIME', content: orderDate.format('h:mm A') });
        globalMergeVars.push({ name: 'DELIVERY_DATE', content: orderDeliveryDate });
        globalMergeVars.push({ name: 'CONTACT_MAILER', content: Meteor.settings.MANDRILL.CONTACT_MAILER });
        globalMergeVars.push({ name: 'ORDER_DELIVERY_INSTRUCTIONS', content: (order.deliveryInstruction ? order.deliveryInstruction : false) });
        globalMergeVars.push({ name: 'ORDER_PRODUCTS', content: orderProductList });
        globalMergeVars.push({ name: 'ORDER_PRODUCTS_COUNT', content: orderProductList.length });
        globalMergeVars.push({ name: 'SHOW_PRODUCT_PRICES', content: showProductPrices });

        log.info("PROCESSING ORDER: ", orderId);
        log.debug("GLOBAL MERGE VARS: ", JSON.stringify(globalMergeVars));
        // Fax integration
        var purveyorSendFax = false
        if(purveyor.hasOwnProperty('sendFax') === true && purveyor.sendFax === true){
          purveyorSendFax = true
          var faxText = []
          faxText.push(`Order Submission From: ${team.name}`)
          faxText.push(`Order Date: ${orderDate.format('dddd, MMMM D')}`)
          faxText.push(`Order Time: ${orderDate.format('h:mm A')}`)
          faxText.push('')
          faxText.push(`PLEASE TEXT OR CALL ONE OF THE CONTACTS ABOVE CONFIRM RECEIPT`)
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
          faxText.push(`PLEASE TEXT OR CALL ONE OF THE CONTACTS ABOVE CONFIRM RECEIPT`)

          var faxOptions = {
            number: purveyor.fax,
            text: faxText.join('\n')
          }
          Meteor.call('faxOrder', faxOptions)
        }
        // FTP Integration
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
        // Sheetsu Integration
        if(purveyor.hasOwnProperty('sheetsu') === true && !!purveyor.sheetsu.trim() === true){
          Meteor.call('uploadOrderToSheetsu', purveyor.sheetsu, {
            team: team,
            purveyor: purveyor,
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
          // Mandrill errors + email rejections
          log.debug("MANDRILL RESPONSE: ", err, responseData);
          let emailRejected = false
          let recipientStatuses = {}
          responseData.data.forEach(function(emailData) {
            recipientStatuses[emailData.email] = emailData.status
          })
          purveyor.orderEmails.split(',').forEach(function(orderEmail) {
            if (recipientStatuses[orderEmail] && recipientStatuses[orderEmail] === 'rejected') {
              emailRejected = true
            }
          })
          if(err || emailRejected){
            log.error('EMAIL ERROR: ', err, emailRejected)
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
                text: 'Mandrill Order Error!',
                attachments: slackAttachments
              });
            }
            Meteor.call('triggerError',
              'technical-error:email',
              'Order Error - please check that the order was emailed to the proper email address.',
              order.userId
            )

            var purveyorName = Purveyors.findOne({_id: order.purveyorId}).name
            var messageAttributes = {
                type: 'error',
                message: `Order Error: ${purveyorName} - please check that the order was emailed to the proper email address.`,
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

            var orderProductCount = Object.keys(order.orderDetails.products).length

            log.debug('SEND MIXPANEL EVENT: ', mixpanelEventName)
            mixpanel.track(mixpanelEventName, {
              distinct_id: user._id,
              sender: `${user.firstName} ${user.lastName}`,
              orderId: orderId,
              orderRef: order.orderRef,
              orderDeliveryDate: orderDeliveryDate,
              orderProductCount: orderProductCount,
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
                text: `${team.name} ordered $${order.subtotal || ''} from ${purveyor.name}`,
                icon_emoji: ':moneybag:',
                attachments: slackAttachments
              });
            }
            // Text the purveyor rep
            if(purveyor.hasOwnProperty('sendSMS') && purveyor.sendSMS === true && purveyor.hasOwnProperty('phone') && !!purveyor.phone.trim() === true){
              var purveyorMsg = `Order emailed from ${team.name} - ${orderProductCount} item(s). To confirm, please Reply All to the email.`
              Meteor.call('sendPurveyorSMS', team, purveyor, order, purveyorMsg)
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
        var orderErrorSlackAttachments = [
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
        alertMsg.push('Meteor Order Error!');
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
          attachments: orderErrorSlackAttachments
        });

        log.error(alertMsg.join('\n'), orderErrorSlackAttachments)
      }

      return ret;
    },

    updateOrder: function(userId, orderId, orderAttributes) {
      log.debug("UPDATE ORDER ATTRS", JSON.stringify(orderAttributes));
      var realOrderId = {_id: orderId};
      orderAttributes.updatedAt = (new Date()).toISOString();
      return Orders.update(realOrderId, {$set: orderAttributes});
    },
  })

}
