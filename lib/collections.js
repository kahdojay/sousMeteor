//TODO: set TTL settings on errors
_ = lodash
Errors = new Mongo.Collection('errors');
Messages = new Mongo.Collection('messages');
Recipes = new Mongo.Collection('recipes');
Orders = new Mongo.Collection('orders');
Purveyors = new Mongo.Collection('purveyors');
Products = new Mongo.Collection('products');
Categories = new Mongo.Collection('categories');
Teams = new Mongo.Collection('teams');

Object.assign = Object.assign || objectAssign;

var allowPermissions = {
  insert: function() {return true;},
  update: function() {return true;},
  remove: function() {return true;}
};
Errors.allow(allowPermissions);
Messages.allow(allowPermissions);
Recipes.allow(allowPermissions);
Orders.allow(allowPermissions);
Purveyors.allow(allowPermissions);
Products.allow(allowPermissions);
Categories.allow(allowPermissions);
Teams.allow(allowPermissions);

// TODO figure out how to factor out util methods in meteor block
//var sanitzeString = function(input) {
//  return input.toString().replace(/\D/g, '');
//}
//

// Mandrill.config({
//   username: Meteor.settings.MANDRILL.USERNAME,  // the email address you log into Mandrill with. Only used to set MAIL_URL.
//   key: Meteor.settings.MANDRILL.PASSWORD  // get your Mandrill key from https://mandrillapp.com/settings/index
//   // port: Meteor.settings.MANDRILL.PORT,  // defaults to 465 for SMTP over TLS
//   // host: Meteor.settings.MANDRILL.HOST,  // the SMTP host
//   // baseUrl: Meteor.settings.MANDRILL.BASEURL  // update this in case Mandrill changes its API endpoint URL or version
// });
// // TEMPLATES
// //   SEND_ORDER: Meteor.settings.MANDRILL.TEMPLATES.SEND_ORDER

Meteor.startup(function() {
  // configure Mandrill
  Mandrill.config({
    username: Meteor.settings.MANDRILL.USERNAME,  // the email address you log into Mandrill with. Only used to set MAIL_URL.
    key: Meteor.settings.MANDRILL.PASSWORD  // get your Mandrill key from https://mandrillapp.com/settings/index
    // port: Meteor.settings.MANDRILL.PORT,  // defaults to 465 for SMTP over TLS
    // host: Meteor.settings.MANDRILL.HOST,  // the SMTP host
    // baseUrl: Meteor.settings.MANDRILL.BASEURL  // update this in case Mandrill changes its API endpoint URL or version
  });
});

//

// Meteor.call('createMessage', [messageAttributes])
Meteor.methods({
  importPurveyors: function(url) {
    // insert purveyors with purveyorCode
    var response = Meteor.http.get(url, {timeout: 10000})
    console.log('importPurveyors response:', response.data.result)
    response.data.result.forEach(function(purveyor) {
      // upsert the purveyor
      Purveyors.update(
        { code: purveyor.code },
        {
          $set: {
            code: purveyor.code,
            name: purveyor.name,
            company: purveyor.company,
            city: purveyor.city,
            state: purveyor.state,
            zipCode: purveyor.zipCode,
            timeZone: purveyor.timeZone,
            orderCutoffTime: purveyor.orderCutoffTime,
            orderMinimum: purveyor.orderMinimum,
            deliveryDays: purveyor.deliveryDays,
            notes: purveyor.notes,
            email: purveyor.email,
            phone: purveyor.phone,
            orderContact: purveyor.orderContact,
            description: purveyor.description,
            updatedAt: (new Date()).getTime()
          },
          $setOnInsert: {
            createdAt: (new Date()).getTime()
          }

        },
        { upsert: true }
      )
    })
  },

  importProducts: function(url) {
    var response = Meteor.http.get(url, {timeout: 10000})
    // console.log('importProducts response:', response)
    // get all purveyors
    var allPurveyors = Purveyors.find({}, {purveyorCode: true}).fetch()
    response.data.result.forEach(function(product) {
      // id the purveyors by product codes
      purveyors = _.filter([product.purveyor1, product.purveyor2, product.purveyor3], function(purveyorCode) {
          var result = _.filter(allPurveyors, {purveyorCode: purveyorCode})
          return result.length > 0 ? result[0]._id : undefined
        }
      )

      // upsert the product
      Products.update(
        { name: product.name },
        {
          $set: {
            name: product.name,
            description: product.description,
            price: product.price,
            purveyors: purveyors,
            amount: product.amount,
            unit: product.unit,
            deleted: false,
            updatedAt: (new Date()).getTime()
          },
          $setOnInsert: {
            createdAt: (new Date()).getTime()
          }
        },
        { upsert: true }
      )

      // put the product in its category
      if (product.category !== '') {
        console.log('updating product category:', product.category)
        var category = Categories.findOne({ name: product.category })
        if (category === undefined) {
          console.log('inserting product category:', product.category)
          Categories.insert({
            name: product.category,
            products: [product._id],
            createdAt: (new Date()).getTime(),
            updatedAt: (new Date()).getTime()
          })
          category = Categories.findOne({ name: product.category })
          console.log('category inserted:', category)
        } else {
          // put the product id in the category.products
          Categories.update(
            { _id: category._id },
            { 
              $push : { products: product._id },
              $set: { updatedAt: (new Date()).getTime() }
            }
          );
        }
      }
    })
  },

  sendSMSInvite: function(phoneNumber, teamId, invitorUserId) {
    //phoneNumber = sanitizeString(phoneNumber);
    phoneNumber = phoneNumber.toString().replace(/\D/g, '');
    var user = Meteor.users.findOne({username: phoneNumber});
    var invitor = Meteor.users.findOne({ _id: invitorUserId });
    var downloadURL = 'beta.sousapp.com/apps';
    var twilio = new Twilio(
      Meteor.settings.TWILIO.SID_PROD,
      Meteor.settings.TWILIO.TOKEN
    );
    var bodyMessage = '';

    if (user === undefined) {
      console.log('creating new user associated with ' + phoneNumber)
      var userId = Accounts.createUser({
        username: phoneNumber,
        teamId: teamId
      });

      Meteor.users.update({_id: userId}, {$set: {
        email: "",
        firstName: "",
        lastName: "",
        imageUrl: "",
        notifications: false,
        smsTokenCount: 0,
        smsToken: null,
        smsSent: false,
        smsVerified: false,
        authToken: null
      }})
      Teams.update({_id: teamId}, {$push: {users: userId}});
      invitee = Meteor.users.findOne({username: phoneNumber});
      bodyMessage = invitor.firstName + ' ' + invitor.lastName[0] + '. invited you to Sous - ' + downloadURL;
    } else {
      console.log('Invitee already exists: ', invitee);
      // console.log('TEAM ID', teamId);
      Teams.update({_id: teamId}, {$push: {users: invitee._id}});
      var team = Teams.findOne({_id: teamId});
      console.log('UPDATED TEAM', team);
      bodyMessage = invitor.firstName + ' ' + invitor.lastName + ' is inviting you to ' + team.name;
    }

    twilio.sendSms({
      to: phoneNumber,
      from: Meteor.settings.TWILIO.FROM,
      body: bodyMessage
    }, Meteor.bindEnvironment( function(err, responseData) {
      if (err) {
        Errors.insert({
          userId: invitor._id,
          machineId: 'technical-error:sms',
          message: 'We apologize for the inconvenience, but we are experiencing technical difficulties. Please try again later.',
          createdAt: (new Date).getTime(),
        })
      }
    }))
  },

  sendSMSCode: function(phoneNumber, authToken){
    var user = Meteor.users.findOne({username: phoneNumber});
    var sendSmsToken = true;
    console.log('User FOUND:', user)
    if (user === undefined) {
      var userId = Accounts.createUser({
        username: phoneNumber,
      });
      var categories = Categories.find().fetch().map(function(category) {
        category.id = category._id
        delete category._id
        return category
      })
      var teamId = Teams.insert({
        name: 'Notepad',
        tasks: [],
        categories: categories,
        users: [userId],
        cart: {
          date: null,
          total: 0.0,
          orders: {}
        },
        orders: [],
        deleted: false
      })
      // TODO: cant the update below be merged with createUser above?
      Meteor.users.update({_id: userId}, {$set: {
        teamId: teamId,
        email: "",
        firstName: "",
        lastName: "",
        imageUrl: "",
        notifications: false,
        smsTokenCount: 0,
        smsToken: null,
        smsSent: false,
        smsVerified: false,
        authToken: null
      }})
      user = Meteor.users.findOne({username: phoneNumber});
    } else {
      if(null !== authToken && authToken === user.authToken){
        sendSmsToken = false;
        Meteor.users.update({_id: user._id}, {$set: {
          smsSent: false,
          smsVerified: true,
          smsTokenCount: 0
        }});
      }
    }

    if(sendSmsToken === true){
      var twilio = new Twilio(
        Meteor.settings.TWILIO.SID_PROD,
        Meteor.settings.TWILIO.TOKEN
      )
      var smsToken = Math.floor(1000 + Math.random() * 9000)

      // limit the number of times a user can be sent an sms token to 10 before having to contact us directly
      // if (user.smsTokenCount <= 10) {
        // reset smsVerified flag
        Meteor.users.update({_id: user._id}, {$set: {
          authToken: null,
          smsSent: false,
          smsVerified: false,
        }});
        console.log('sending smsToken to ' + phoneNumber + ': ' + smsToken)
        twilio.sendSms({
          to: phoneNumber,
          from: Meteor.settings.TWILIO.FROM,
          body: smsToken + ' is your Sous verification code.'
        }, Meteor.bindEnvironment( function(err, responseData) {
          if (!err) {
            Meteor.users.update({_id: user._id}, {$set: {
              smsToken: smsToken,
              smsSent: true,
              smsVerified: false,
            }});
            user = Meteor.users.findOne({_id: user._id});
            console.log('Updated:', user)
          } else {
            Errors.insert({
              userId: user._id,
              machineId: 'technical-error:sms',
              message: 'We apologize for the inconvenience, but we are experiencing technical difficulties. Please try again later.',
              createdAt: (new Date).getTime(),
            })
          }
        }))
      // } else {
      //   Errors.insert({
      //     userId: user._id,
      //     machineId: 'token-limit',
      //     message: 'You have reached token limit, please contact us.',
      //     createdAt: (new Date).getTime(),
      //   })
      // }
    }
  },

  loginWithSMS: function(phoneNumber, token){
    console.log('LOGIN WITH SMS: ', phoneNumber, token)
    // if the user exists and the token matches, set the user's token and return the user
    var user = Meteor.users.findOne({username: phoneNumber});
    console.log('USER: ', user);
    if (user.smsToken === parseInt(token.trim())) {
      //TODO: Double check into Accounts.getNewToken() instead..
      //https://github.com/meteor/meteor/blob/master/packages/accounts-base/accounts_server.js
      var stampedToken = Accounts._generateStampedLoginToken();
      // from: https://meteorhacks.com/extending-meteor-accounts
      var hashStampedToken = Accounts._hashStampedToken(stampedToken);
      console.log('TOKEN: ', hashStampedToken);
      var userData = {
        smsVerified: true,
        authToken: hashStampedToken,
        smsTokenCount: 0, // reset it back to 0 on successful login
      };
      if(user.hasOwnProperty('teamId') === false || !user.teamId){
        var categories = Categories.find().fetch().map(function(category) {
          category.id = category._id
          delete category._id
          return category
        })
        var teamId = Teams.insert({
          name: 'Notepad',
          tasks: [],
          categories: categories,
          users: [user._id],
          cart: {
            date: null,
            total: 0.0,
            orders: {}
          },
          orders: [],
          deleted: false
        })
        userData.teamId = teamId;
      }
      var update = Meteor.users.update({_id: user._id}, {$set:userData})
      console.log('UPDATE: ', update, ' with: ', userData)
    } else {
      Meteor.users.update({_id: user._id}, {$set: {
        authToken: null,
        smsToken: null,
        smsSent: false,
        smsVerified: false,
        smsTokenCount: (user.smsTokenCount + 1)
      }});
      Errors.insert({
        userId: user._id,
        machineId: 'verification-error',
        message: 'Invalid token',
        createdAt: (new Date).getTime(),
      })
    }
  },

  updateUser: function(userId, userAttributes){
    //TODO: prevent updates of critical attributes, smsToken, authToken, etc..
    var update = Meteor.users.update({_id: userId}, {$set:userAttributes})
    console.log('UPDATE: ', update, ' with: ', userAttributes)
  },

  // createMessage method
  createMessage: function(messageAttributes) {
    console.log("MESSAGE ATTRS", messageAttributes);
    if(messageAttributes.imageUrl === ""){
      messageAttributes.imageUrl = "https://lh3.googleusercontent.com/-8e1m8YBYSe0/AAAAAAAAAAI/AAAAAAAAAAA/jRTl40sO4fM/s40/photo.jpg"
    }
    var newMessage = Messages.insert(messageAttributes);
    console.log("NEW MESSAGE", newMessage);
  },

  createTeam: function(teamAttributes) {
    console.log("TEAM ATTRS", teamAttributes);
    var team = Teams.findOne({_id: teamAttributes._id, name: teamAttributes.name});
    if(team === undefined){
      var teamId = Teams.insert(teamAttributes);
      var team = Teams.findOne({_id: teamId});
      console.log("CREATED TEAM", team);
    } else {
      console.log("Team already exists");
      // TODO: publish an error
    }
  },

  updateTeam: function(teamId, teamAttributes) {
    console.log("UPDATE TEAM ATTRS", JSON.stringify(teamAttributes));
    var realTeamId = {_id: teamId};
    Teams.update(realTeamId, {$set: teamAttributes});
  },

  addTeamTask: function(userId, teamId, taskAttributes) {
    var realTeamId = {_id: teamId};
    console.log("TEAM ID ", teamId);
    console.log("TASK ATTRS ", taskAttributes);
    var teamHasTask = Teams.findOne({_id: teamId, "tasks.name": taskAttributes.name},{id:1})
    console.log(teamHasTask);
    if(teamHasTask === undefined){
      var recipeId = Recipes.insert({
        _id: taskAttributes.recipeId,
        name: taskAttributes.name,
        ingredients: [] // for future use
      });
      Teams.update(realTeamId, {$push: {tasks: taskAttributes}});
    } else {
      Errors.insert({
        userId: userId,
        machineId: 'add-error',
        message: 'Team task already exists',
        createdAt: (new Date).getTime(),
      })
    }
  },

  updateTeamTask: function(teamId, recipeId, taskAttributes){
    console.log("TEAM ID ", teamId);
    console.log("RECIPE ID ", recipeId);
    console.log("TASK ATTRS ", taskAttributes);
    var realTeamId = {_id: teamId};
    var team = Teams.findOne(realTeamId);
    if(team){
      // needed to add: meteor add maxharris9:object-assign
      // var taskIdx = _.findIndex(team.tasks, function(task) {
      //   return task.recipeId === recipeId
      // });
      var taskIdx;
      // console.log("TEAM", team);
      team.tasks.forEach(function(task, index) {
        if (task.recipeId == recipeId)
          taskIdx = index;
      });
      team.tasks[taskIdx] = Object.assign({}, team.tasks[taskIdx], taskAttributes);
      Teams.update(realTeamId, {$set: {tasks: team.tasks}});
    }
    team = Teams.findOne({_id: teamId});
    console.log("UPDATED TEAM", team);
  },

  deleteTeam: function(teamId) {
    console.log("DELETE TEAM", teamId);
    Teams.update(teamId, {$set: {deleted: true}});
  },

  createPurveyor: function(purveyorAttributes) {
    console.log("PURVEYOR ATTRS", purveyorAttributes);
    var purveyor = Purveyors.findOne({teamId: purveyorAttributes.teamId, name:purveyorAttributes.name});
    if(purveyor === undefined){
      var purveyorId = Purveyors.insert(purveyorAttributes);
      var purveyor = Purveyors.findOne({_id: purveyorId});
      console.log("CREATED PURVEYOR", purveyor);
    } else {
      console.log("Purveyor already exists");
      // TODO: publish an error
    }
  },

  addPurveyorProduct: function(purveyorId, productAttributes) {
    var realPurveyorId = {_id: purveyorId};
    console.log("PURVEYOR ID ", purveyorId);
    console.log("PRODUCT ATTRS ", productAttributes);
    var purveyorHasProduct = Purveyors.findOne({_id: purveyorId, "product.name": productAttributes.name},{id:1})
    console.log(purveyorHasProduct);
    if(purveyorHasProduct === undefined){
      var productId = Products.insert({
        _id: productAttributes.productId,
        name: productAttributes.name,
      });
      Purveyors.update(realPurveyorId, {$push: {products: productAttributes}});
    } else {
      console.log("Purveyor product already exists");
      // TODO: publish an error
    }
  },

  updatePurveyorProduct: function(purveyorId, productId, productAttributes){
    console.log("PURVEYOR ID ", purveyorId);
    console.log("PRODUCT ID ", productId);
    console.log("PRODUCT ATTRS ", productAttributes);
    var realPurveyorId = {_id: purveyorId};
    var purveyor = Purveyors.findOne(realPurveyorId);
    if(purveyor){
      // needed to add: meteor add maxharris9:object-assign
      // var productIdx = _.findIndex(purveyor.products, function(product) {
      //   return product.productId === productId
      // });
      var productIdx;
      // console.log("PURVEYOR", purveyor);
      purveyor.products.forEach(function(product, index) {
        if (product.productId == productId)
          productIdx = index;
      });
      purveyor.products[productIdx] = Object.assign({}, purveyor.products[productIdx], productAttributes);
      Purveyors.update(realPurveyorId, {$set: {products: purveyor.products}});
    }
    purveyor = Purveyors.findOne({_id: purveyorId});
    console.log("UPDATED PURVEYOR", purveyor);
  },

  deletePurveyor: function(purveyorId) {
    console.log("DELETE PURVEYOR", purveyorId);
    Purveyors.update(purveyorId, {$set: {deleted: true}});
  },

  sendCart: function(userId, teamId, teamOrderId) {
    // double check if cart has any items
    var realTeamId = {_id: teamId}
    console.log('PARAMS', userId, teamId, teamOrderId);
    var team = Teams.findOne(realTeamId, {cart: 1});
    console.log('TEAM', team.cart);
    var teamCart = team.cart;

    // if the cart has orders
    if(Object.keys(teamCart.orders).length > 0){

      // <team>
      // {
      //   "_id": "tEtyZToEKuAeYs8NX",       // teamId
      //   "cart": {
      //     "date": 1445226109438,
      //     "total": 0,
      //     "orders": {
      //       "k458EQKzDH4y5tvFQ": {       // purveyorId
      //         "total": 0,
      //         "deliveryInstruction": "",
      //         "products": {
      //           "fuhw5ySv2KZhiNfWL": {   // productId
      //             "quantity": 3,
      //             "note": ""
      //           }
      //         }
      //       }
      //     }
      //   }
      // }

      // iterate over the orders, add an order for each purveyor
      Object.keys(teamCart.orders).forEach(function(purveyorId){
        var order = teamCart.orders[purveyorId];
        // Insert order for send
        var orderId = Orders.insert({
          _id: order.id,
          userId: userId,
          teamId: teamId,
          teamOrderId: teamOrderId,
          orderedAt: (new Date()).getTime(),
          purveyorId: purveyorId,
          orderDetails: order,
          sent: false,
          error: false,
          mandrillResponse: null,
          createdAt: teamCart.date,
          updatedAt: (new Date()).getTime(),
        });
        // update the team orders
        Teams.update(realTeamId, {
          $push: {
            orders: { id: orderId, sent: false, error: false }
          }
        });
      }.bind(this));

      // reset the team cart
      Teams.update(realTeamId, {
        $set: {
          cart: { date: null, total: 0.0, orders: {} }
        }
      });

      // send the orders
      Meteor.call('sendOrders',[])

    } else {
      Errors.insert({
        userId: userId,
        machineId: 'technical-error:order',
        message: 'No items in the cart.',
        createdAt: (new Date).getTime(),
      })
    }
  },

  sendOrders: function() {
    var unsentOrders = Orders.find({sent: false}).fetch();
    // var unsentOrders = [Orders.findOne({sent: false})];

    if(unsentOrders.length > 0){

      unsentOrders.forEach(function(order){

        // real order id
        var realOrderId = {_id: order.id};

        // lookup PURVEYOR info
        var purveyor = Purveyors.findOne({ _id: order.purveyorId });
        console.log('PURVEYOR', purveyor);
        // lookup BUYER info
        var team = Teams.findOne({ _id: order.teamId });
        var user = Meteor.users.findOne({ _id: order.userId });

        // setup our buyer contact list
        var buyerContacts = []

        // add user info
        var contact = []
        contact.push(user.lastName || 'First')
        contact.push(', ')
        contact.push(user.firstName || 'Last')
        contact.push(' • ')
        contact.push(user.email || 'first.name@example.com');

        // TODO: should we add the other team members as contacts ??

        // add contact to the buyer contact list
        buyerContacts.push(contact.join(''))

        var teamCityStateZip = [];
        teamCityStateZip.push(team.city || 'City');
        teamCityStateZip.push(', ');
        teamCityStateZip.push(team.state || 'ST');
        teamCityStateZip.push(' ');
        teamCityStateZip.push(team.zip || '00000');

        // get order date
        var orderDate = moment(order.orderedAt);

        // get the order product list
        var orderProductList = [];

        // add the order products
        var idx = 0
        Object.keys(order.orderDetails.products).forEach(function(productId){
          var product = Products.findOne({ _id: productId });
          var productOrderDetails = order.orderDetails.products[productId];

          // add product to the order products list
          orderProductList.push({
            idx: idx,
            name: product.name || 'Product Name',
            sku: product.sku || 'SKU',
            quantity: productOrderDetails.quantity,
            unit: product.unit,
            notes: productOrderDetails.notes
          });
          idx++;
        })

        // setup the global merge vars
        var globalMergeVars = [];
        globalMergeVars.push({ name: 'PURVEYOR_NAME', content: purveyor.name });
        globalMergeVars.push({ name: 'BUYER_NAME', content: team.name });
        globalMergeVars.push({ name: 'BUYER_CONTACTS', content: buyerContacts.join('<br>') });
        globalMergeVars.push({ name: 'BUYER_ADDRESS', content: team.address || '123 Main Street' });
        globalMergeVars.push({ name: 'BUYER_CITY_STATE_ZIP', content: teamCityStateZip.join('') });
        globalMergeVars.push({ name: 'ORDER_DATE', content: orderDate.format('dddd, MMMM D') });
        globalMergeVars.push({ name: 'ORDER_TIME', content: orderDate.format('h:mm A') });
        globalMergeVars.push({ name: 'CONTACT_MAILER', content: Meteor.settings.MANDRILL.CONTACT_MAILER });
        globalMergeVars.push({ name: 'ORDER_DELIVERY_INSTRUCTIONS', content: (order.deliveryInstruction ? order.deliveryInstruction : false) });
        globalMergeVars.push({ name: 'ORDER_PRODUCTS', content: orderProductList });

        console.log("GLOBAL MERGE VARS: ", JSON.stringify(globalMergeVars));

        /* */
        // send order email
        // tutorial/source:
        //  - https://github.com/Wylio/meteor-mandrill/
        //  - http://dev4devs.com/2015/06/05/meteor-js-how-to-do-to-send-e-mail-with-a-mandrill-account/
        //  - http://kbcdn.mandrill.com/handlebars-example-sendtemplate-api.txt


        // this.unblock(); // http://docs.meteor.com/#/full/method_unblock
        // send the template
        Mandrill.messages.sendTemplate({
          template_name: Meteor.settings.MANDRILL.TEMPLATES.SEND_ORDER,
          template_content: [],
          message: {
            to: [
              { email: purveyor.email } // need purveyor email addresses
            ],
            auto_text: true,
            inline_css: true,
            merge: true,
            merge_language: "handlebars",
            global_merge_vars: globalMergeVars
          }
        }, function(err, responseData){
          // console.log("MANDRILL RESPONSE: ", err, responseData);
          if(err){
            // // Insert
            // Errors.insert({
            //   userId: order.userId,
            //   machineId: 'technical-error:email',
            //   message: 'No items in the cart.',
            //   createdAt: (new Date).getTime(),
            // });

            // Update order error
            Orders.update(realOrderId, { $set: {
              sent: false,
              error: true,
              mandrillResponse: responseData,
              updatedAt: (new Date()).getTime(),
            }});
            // update the team orders
            Teams.update({_id: order.teamId, "orders.id": order.id}, {
              $set: {
                orders: { sent: false, error: true }
              }
            });
          } else {
            // Update order sent
            Orders.update(realOrderId, { $set: {
              sent: true,
              error: false,
              mandrillResponse: responseData,
              updatedAt: (new Date()).getTime(),
            }});
            // update the team orders
            Teams.update({_id: order.teamId, "orders.id": order.id}, {
              $set: {
                orders: { sent: true, error: false }
              }
            });
          }
        }.bind(this));
        /* */

      })

    }
  }


})
