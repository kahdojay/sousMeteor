Errors = new Mongo.Collection('errors');
Messages = new Mongo.Collection('messages');
Recipes = new Mongo.Collection('recipes');
Orders = new Mongo.Collection('orders');
Purveyors = new Mongo.Collection('purveyors');
Products = new Mongo.Collection('products');
Categories = new Mongo.Collection('categories');
Teams = new Mongo.Collection('teams');
Settings = new Mongo.Collection('settings');
Export = new Mongo.Collection('export');
CartItems = new Mongo.Collection('cart_items');

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
Settings.allow(allowPermissions);
Export.allow(allowPermissions);
CartItems.allow(allowPermissions);

if(Meteor.isServer){
  _ = lodash
  var base = process.env.PWD
  pkgInfo = Npm.require(base + '/package.json');

  var fs = Npm.require('fs');
  var slug = Npm.require('slug');
  var aguid = Npm.require('aguid');
  var Putter =  Npm.require('base64-string-s3');
  // var Phaxio = Npm.require('phaxio');


  settingsConfig = {};
  try {
    var includeFile = base + '/include.json';
    var includeStats = fs.statSync(includeFile);
    if(includeStats.isFile()){
      var includeInfo = Npm.require(includeFile);
      settingsConfig = includeInfo.config;
      pkgInfo.build = includeInfo.build;
    }
  } catch(e){
    if(pkgInfo.hasOwnProperty('config') === true){
      settingsConfig = pkgInfo.config;
    }
  }
  settingsConfig.itunesUrl = Meteor.settings.APP.ITUNES_URL

  log = logger.bunyan.createLogger({
    name: 'Sous',
    stream: process.stdout.isTTY ?
              new logger.bunyanPrettyStream(process.stdout) :
              process.stdout,
    level: 'debug'
  })


  Object.assign = Object.assign || objectAssign;

  var STATUS = {
    USER: { NEW: 'NEW', EXISTING: 'EXISTING' },
    MESSAGE: { NEW: 'NEW', EXISTING: 'EXISTING' },
    NOTEPAD: { NEW: 'NEW', EXISTING: 'EXISTING' },
    CART_ITEM: { NEW: 'NEW', ORDERED: 'ORDERED', RECEIVED: 'RECEIVED', DELETED: 'DELETED' },
  };

  // TODO: remove this after all data transition to CartItems
  var EMPTY_CART = { date: null, total: 0.0, orders: {} };

  var APPROVED_PRODUCT_ATTRS = {
    name: true,
    description: true,
    purveyors: true,
    amount: true,
    unit: true,
    deleted: true,
    updatedAt: true,
  };

  var APPROVED_CART_ITEM_ATTRS = {
    purveyorId: true,
    orderId: true,
    quantity: true,
    note: true,
  }

  var APPROVED_PARSE_UPDATE_ATTRS = {
    "appVersion": 1,
    "appBuildNumber": 1,
    "deviceType": 1,
    "deviceToken": 1,
    "deviceModel": 1,
    "deviceName": 1,
    "deviceSystemName": 1,
    "deviceSystemVersion": 1,
    "installationId": 0, // NOTE: this field is readonly, so it can only be set once
    "channels": 1,
    "phoneNumber": 1,
    "userId": 1,
    "badge": 1,
  };

  var PARSE = {
    INSTALLATION_URL: 'https://api.parse.com/1/installations',
    PUSH_URL: 'https://api.parse.com/1/push',
    CONFIG_URL: 'https://api.parse.com/1/config',
    HEADERS: {
      "Accept": "application/json",
      "X-Parse-Application-Id": Meteor.settings.PARSE.APPLICATION_ID,
      "X-Parse-REST-API-Key": Meteor.settings.PARSE.REST_API_KEY,
      "Content-Type": "application/json",
    }
  }

  var excludeSlackNotificationTeams = {}

  var options = {
      key: Meteor.settings.AWS_ACCESS_KEY_ID,
      secret: Meteor.settings.AWS_SECRET_ACCESS_KEY,
      bucket: Meteor.settings.S3_BUCKET,
      // chunkSize: 512 // [optional] defaults to 1024
  }
  var putter = new Putter(options);

  Meteor.startup(function() {
    // .createIndex( { "createdAt": 1 }, { expireAfterSeconds: 3600 } )
    Errors._ensureIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 5 }
    );
    Messages._ensureIndex(
      { teamId: 1, createdAt: -1 }
    );
    Products._ensureIndex(
      { teamId: 1}
    );
    Purveyors._ensureIndex(
      { teamId: 1}
    );
    Categories._ensureIndex(
      { teamId: 1}
    );
    Settings._ensureIndex(
      { userId: 1 }
    );
    Orders._ensureIndex(
      { teamId: 1}
    );
    Orders._ensureIndex(
      { teamId: 1, orderedAt: 1}
    );
    CartItems._ensureIndex(
      { teamId: 1 }
    );
    CartItems._ensureIndex(
      { orderId: 1 }
    );
    CartItems._ensureIndex(
      { teamId: 1, orderId: 1 }
    );
    CartItems._ensureIndex(
      { teamId: 1, purveyorId: 1, productId: 1, status: 1 }
    );
    // configure Mandrill
    Mandrill.config({
      username: Meteor.settings.MANDRILL.USERNAME,  // the email address you log into Mandrill with. Only used to set MAIL_URL.
      key: Meteor.settings.MANDRILL.API_KEY,  // get your Mandrill key from https://mandrillapp.com/settings/index
      // port: Meteor.settings.MANDRILL.PORT,  // defaults to 465 for SMTP over TLS
      host: Meteor.settings.MANDRILL.HOST,  // the SMTP host
      baseUrl: Meteor.settings.MANDRILL.BASEURL, // Meteor.settings.MANDRILL.BASEURL  // update this in case Mandrill changes its API endpoint URL or version
    });
    slack.onError = function (err) {
      log.error('SLACK API error:', err)
    };

    // setup putter
    putter.on('progress', function (data) {
      log.trace('progress', data);
      // progress { percent: 20, written: 768, total: 3728 }
    });
    putter.on('response', function (data) {
      log.trace('response', data);
      // response { path: 'https://<bucket>.s3.amazonaws.com/images/success.jpg' }
    });
    putter.on('error', function (err) {
      log.error('putter error', err);
    });
    putter.on('close', function () {
      log.trace('closed connection');
    });
  });

  Meteor.methods({
    sendSlackNotification: function(teamId){
      var excludeTeams = ['DEMO', 'DEV', 'MAGGIESDEMO', 'SEANSDEMO']
      var team = null
      if(excludeSlackNotificationTeams.hasOwnProperty(teamId)){
        team = excludeSlackNotificationTeams[teamId]
      } else {
        team = Teams.findOne({_id: teamId});
        excludeSlackNotificationTeams[teamId] = team
      }
      return excludeTeams.indexOf(team.teamCode) === -1
    },

    getBuildInfo: function(){
      return {
        version: pkgInfo.version,
        build: pkgInfo.build,
      };
    },

    getSettingsConfig: function() {
      log.debug('RETURNING SETTINGS CONFIG: ', settingsConfig)
      return settingsConfig;
    },

    getAppStoreVersion: function() {
      try {
        var response = Meteor.http.get('https://itunes.apple.com/lookup?id=1048477858', {timeout: 10000});
        return response.data.results[0].version
      } catch(e){
        return null
      }
    },

    renamePurveyor: function(purveyorCode, newPurveyorName) {
      let purveyor = Purveyors.findOne({purveyorCode: purveyorCode})
      Purveyors.update(
        {_id: purveyor._id},
        { $set: {
          name: newPurveyorName,
          company: newPurveyorName,
          updatedAt: (new Date()).toISOString(),
        }}
      )
    },

    // imageKey is the key in the s3 bucket
    streamS3Image: function(imageData, imageKey, userId) {
      // put arguments: base64 string, object key, mime type, permissions
      putter.put(
        imageData,
        imageKey,
        'image/jpeg',
        'public-read',
        Meteor.bindEnvironment(function(response) {
          Meteor.users.update({_id: userId}, {$set: {
            imageUrl: response.url,
            imageChangedAt: (new Date()).toISOString(),
            updatedAt: (new Date()).toISOString(),
          }})
        })
      );
    },

    streamS3InvoiceImages: function(orderId, invoiceImages, userId) {
      log.debug("UPLOADING INVOICES - for orderId: ", orderId, " invoices: ", invoiceImages.length, " added by userId: ", userId)

      // put arguments: base64 string, object key, mime type, permissions
      var bodyLinks = []
      invoiceImages.forEach(function(invoice){
        bodyLinks.push(`- https://sous-assets-production.s3.amazonaws.com/${invoice.name}`)
        putter.put(
          invoice.data,
          invoice.name,
          invoice.type,
          'public-read',
          Meteor.bindEnvironment(function(response) {
            Orders.update({_id: invoice.orderId}, {
              $push: { invoices: {
                id: invoice.id,
                userId: invoice.userId,
                imageUrl: response.url,
                location: 'server',
                createdAt: invoice.createdAt,
                updatedAt: (new Date()).toISOString(),
              }},
              $set: {
                updatedAt: (new Date()).toISOString(),
              }
            })
          })
        );
      })

      var user = Meteor.users.findOne({_id: userId});
      var order = Orders.findOne({_id: orderId});
      var team = Teams.findOne({ _id: order.teamId });
      var purveyor = Purveyors.findOne({ _id: order.purveyorId });
      var timeZone = 'UTC';
      if(purveyor.hasOwnProperty('timeZone') && purveyor.timeZone){
        timeZone = purveyor.timeZone;
      }

      var orderDate = moment(order.orderedAt).tz(timeZone);


      Meteor.call('sendEmail', {
        type: 'UPLOAD_ORDER_INVOICE',
        fromEmail: user.email,
        fromName: `${user.firstName} ${user.lastName}`,
        subject: `Invoice(s) uploaded for Order: ${purveyor.name} by ${team.name} on ${orderDate.format('dddd, MMMM D')}`,
        body: `Order: ${purveyor.name} by ${team.name} on ${orderDate.format('dddd, MMMM D')} at ${orderDate.format('h:mm A')} \n\n Invoices uploaded: \n\n ${bodyLinks.join('\n')} \n\n Thank you,\n Sous Invoice Bot`,
      })
    },

    relinkOrderData: function (teamCodes){
      if(teamCodes === undefined){
        teamCodes = 'all'
      } else if(teamCodes !== undefined && _.isArray(teamCodes) === false){
        teamCodes = [teamCodes]
      }
      var ret = {
        success: false,
        teamCodes: teamCodes,
        ordersCount: null,
        ordersFixed: null,
        ordersFailed: null,
        ordersOk: null
      }

      var queryOptions = {};
      if(teamCodes !== 'all'){
        var teams = Teams.find({teamCode: {$in: teamCodes}},{fields:{_id:1}}).fetch();
        var teamIds = _.map(teams, function(team){
          return team._id;
        })
        queryOptions['teamId'] = {$in: teamIds};
      }

      var allOrders = Orders.find(queryOptions).fetch();
      ret.ordersCount = allOrders.length;

      allOrders.forEach(function(order){
        var orderPurveyor = Purveyors.findOne({_id:order.purveyorId});
        var orderUpdate = {}
        var error = false;

        if(orderPurveyor === undefined){
          error = true
        } else {
          if(order.hasOwnProperty('purveyorCode') === false){
            orderUpdate.purveyorCode = orderPurveyor.purveyorCode;
          }

          var orderProducts = Object.keys(order.orderDetails.products)
          orderProducts.forEach(function(productId){
            var orderProduct = Products.find({_id: productId})
            if(orderProduct === undefined){
              error = true
            }
          })
        }

        if(error === false){
          if(Object.keys(orderUpdate).length > 0){
            orderUpdate.updatedAt = (new Date()).toISOString();
            var update = Orders.update({_id: order._id}, {$set: orderUpdate});
            log.debug('Updating order: ', update, ' with data: ', orderUpdate);
          } else {
            log.debug('Order ok! ')
          }
          ret.ordersOk = (ret.ordersOk === null) ? 1 : ret.ordersOk + 1
        } else {
          ret.ordersFailed = (ret.ordersFailed === null) ? 1 : ret.ordersFailed + 1
          log.debug('Order relink failed: ', order.id)
        }
      })

      ret.success = true

      return ret;
    },

    cleanupData: function(){

      var flattenUniqueArray = function(arr, oldFlat){
        var flat = oldFlat || [];
        if(_.isArray(arr)){
          arr.forEach(function(item){
            if(_.isArray(item)){
              flat = flattenUniqueArray(item, flat)
            } else {
              if(flat.indexOf(item) === -1){
                flat.push(item)
              }
            }
          }.bind(this));
        }
        return flat;
      }

      // cleanup categories
      var categories = Categories.find({},{fields:{name:1, products:1, teamCode: 1}}).fetch();
      categories.forEach(function(category){
        var filteredCategoryProducts = flattenUniqueArray(category.products);
        var categoryProducts = [];
        filteredCategoryProducts.forEach(function(productId){
          var product = Products.findOne({_id: productId});
          if(product !== undefined){
            categoryProducts.push(productId);
          } else {
            log.debug('Category: ' + category.name + ' for team: ' + category.teamCode + ' has products that do not exist.')
          }
        })
        if(categoryProducts.length > 0){
          var removed = Categories.remove({_id:category._id});
          log.error('Deleted category: ' + category.name, ' teamCode: ', category.teamCode, removed);
        } else if(filteredCategoryProducts.length !== categoryProducts.length) {
          var updated = Categories.update({_id:category._id},{
            $set:{
              products: categoryProducts,
              updatedAt: (new Date()).toISOString(),
            }
          });
          log.debug('Fixed category: ' + category.name, ' teamCode: ', category.teamCode, updated);
        } else {
          log.debug('No fix necessary: ' + category.name, ' teamCode: ', category.teamCode);
        }
      });

      var teams = Teams.find({notepad:{$exists:false}}, {fields:{name:1, users:1}}).fetch();
      teams.forEach(function(team){
        var filteredTeamUsers = flattenUniqueArray(team.users);
        var teamUsers = [];
        filteredTeamUsers.forEach(function(userId){
          var user = Meteor.users.findOne({_id: userId});
          if(user !== undefined){
            teamUsers.push(userId);
          }
        })
        var updated = Teams.update({_id: team._id},{
          $set: {
            users: teamUsers,
            updatedAt: (new Date()).toISOString()
          }
        });
        log.debug('Fixed team: ' + team.name, updated);
      })
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

    relinkMessagesToOrders: function(teamCodes){
      if(undefined === teamCodes){
        teamCodes = 'all';
      }
      var ret = {
        'success': null,
        'updated': {},
      }

      // get all the orders
      var orderFindOptions = {}
      if(teamCodes !== 'all'){
        if(_.isArray(teamCodes) === false){
          teamCodes = [teamCodes]
        }
        orderFindOptions = {
          teamCode: {$in: teamCodes}
        }
      }
      var allOrders = Orders.find(orderFindOptions,{sort:{orderedAt: -1}}).fetch();

      allOrders.forEach(function(order){
        // check if a message with the orderId already exists with type='order'
        var messageFindOptions = {
          type: 'order',
          orderId: order._id
        };
        var orderMessage = Messages.findOne(messageFindOptions);
        if( orderMessage === undefined){
          // get purveyor data
          var purveyor = Purveyors.findOne({_id: order.purveyorId})
          // find associated message within the hour by team, and purveyor
          var re = new RegExp(order.orderedAt.substr(0, 11))
          orderMessage = Messages.findOne({
            purveyor: purveyor.name,
            teamId: order.teamId,
            createdAt: re,
            orderId: {$exists: false},
          });
          if(orderMessage !== undefined){
            // update the message with the orderId
            ret.updated[order._id] = Messages.update({_id: orderMessage._id}, {$set: {
              orderId: order._id,
              updatedAt: (new Date()).toISOString(),
            }});
            log.debug('SUCCESSFULLY linked message to order: ', order._id)
          } else {
            log.error('Cannot find message for order: ', order._id)
          }
        } else {
          log.debug('Order already contains linked message: ', order._id)
        }
      })

      return ret;
    },

    transferPurveyorProducts: function(fromPurveyorName, toPurveyorName) {
      fromPurveyorId = Purveyors.findOne({ name: fromPurveyorName })._id
      toPurveyorId = Purveyors.findOne({ name: toPurveyorName })._id

      fromPurveyorProducts = Products.find({ purveyors: { $in: [fromPurveyorId] }}).fetch()

      fromPurveyorProducts.forEach(function(product) {
        let purveyorsArray = product.purveyors
        let toPurveyorExistingIndex = _.indexOf(purveyorsArray, toPurveyorId)
        let fromPurveyorIndex = _.indexOf(purveyorsArray, fromPurveyorId)
        if (toPurveyorExistingIndex === -1) {
          purveyorsArray[fromPurveyorIndex] = toPurveyorId
        } else {
          purveyorsArray.splice(fromPurveyorIndex, 1)
        }
        Products.update(
          { _id: product._id },
          { $set : {
            purveyors: purveyorsArray,
            updatedAt: (new Date).toISOString(),
          } }
        )
      })
    },

    createError: function(msg) {
      log.error('creating error: ', msg)
      return Meteor.call('triggerError',
        'test',
        'test error: [' + msg + ']',
        Meteor.users.findOne({ username: '8067892921' })._id
      )
    },

    resetDemoData: function(resetProducts) {
      var updateProducts = (resetProducts === true) ? true : false
      var status = {
        demoTeam: null,
        remove: {},
        import: {},
        remove: {},
        update: {},
      };
      status.demoTeam = Teams.findOne({teamCode: Meteor.settings.APP.DEMO_TEAMCODE});

      // status.remove.purveyors = Purveyors.remove({teamCode: Meteor.settings.APP.DEMO_TEAMCODE});
      // status.remove.products = Products.remove({teamCode: Meteor.settings.APP.DEMO_TEAMCODE});
      // status.remove.categories = Categories.remove({teamCode: Meteor.settings.APP.DEMO_TEAMCODE});
      // status.remove.orders = Orders.remove({teamId: status.demoTeam._id});
      // status.remove.cartItems = CartItems.remove({teamId: status.demoTeam._id});

      status.remove.messages = Messages.remove({teamId: status.demoTeam._id});
      status.update.tasks = Teams.update({_id: status.demoTeam._id}, {$set:{
        tasks:[],
        deleted: false,
        updatedAt: (new Date()).toISOString(),
      }})

      status.import.messages = Meteor.call('importMessages', Meteor.settings.APP.DEMO_TEAMCODE, undefined, Meteor.settings.SHEETSU.DEMO_MESSAGES);
      status.import.teamTasks = Meteor.call('importTeamTasks', Meteor.settings.APP.DEMO_TEAMCODE, undefined, Meteor.settings.SHEETSU.DEMO_TASKS);
      status.import.purveyors = Meteor.call('importPurveyors', Meteor.settings.APP.DEMO_TEAMCODE, undefined, Meteor.settings.SHEETSU.PURVEYORS);
      if(updateProducts === true){
        status.import.products = Meteor.call('importProducts', Meteor.settings.APP.DEMO_TEAMCODE, undefined, Meteor.settings.SHEETSU.DEMO_PRODUCTS);
      } else {
        log.debug("\n\n ------ SKIPPING PRODUCT IMPORT ------ \n\n");
      }

      // if(status.import.messages.length > 0){
      //   var hoursIndex = [12, 12, 12, 12, 13, 13]
      //   var minutesIndex = [13, 15, 16, 30, 37, 38]
      //   var demoMessages = Messages.find({teamId: demoTeam._id},{sort:{createdAt: 1}}).fetch()
      //
      //   demoMessages.forEach(function(message, idx) {
      //     var newCreatedAt = new Date(message.createdAt)
      //     newCreatedAt.setHours(hoursIndex[idx])
      //     newCreatedAt.setMinutes(minutesIndex[idx])
      //     Messages.update({_id: message._id}, {$set: {
      //       createdAt: newCreatedAt.toISOString(),
      //       updatedAt: newCreatedAt.toISOString(),
      //     }})
      //   })
      // }

      return status;
    },

    importMessages: function(importTeamCode, teamCodeOverride, url) {
      if(undefined === importTeamCode){
        importTeamCode = 'all';
      }
      var ret = {
        'messages': {}
      }
      var response = Meteor.http.get(url, {timeout: 10000});
      var newMessages = response.data.result
      newMessages.forEach(function(message, idx) {
        if(message.hasOwnProperty('teamCode') === false){
          ret.messages[message._id] = 'Missing teamCode.';
          return false
        }
        if(message.hasOwnProperty('process') === false){
          message.process = 'FALSE';
        }
        if(message.process === 'FALSE'){
          ret.messages[message._id] = 'Process flag: ' + message.process;
          return false;
        }

        if(importTeamCode !== undefined && importTeamCode !== 'all'){
          if(message.teamCode !== importTeamCode){
            log.debug('Skipping teamCode: ' + message.teamCode);
            return false;
          }
        }

        var messageAttributes = {
          createdAt: (new Date()).toISOString(),
        };

        if(message.hasOwnProperty('createdHourMinute') && message.createdHourMinute !== ''){
          var newCreatedAt = new Date(messageAttributes.createdAt)
          var hoursMinsArray = message.createdHourMinute.split(':')
          newCreatedAt.setHours(hoursMinsArray[0])
          newCreatedAt.setMinutes(hoursMinsArray[1])
          messageAttributes.createdAt = newCreatedAt.toISOString();
        }

        if(message.hasOwnProperty('type') && message.type !== ''){
          messageAttributes.type = message.type;
        }

        if(message.hasOwnProperty('purveyor') && message.purveyor !== ''){
          messageAttributes.purveyor = message.purveyor;
        }

        if(message.hasOwnProperty('message') && message.message !== ''){
          messageAttributes.message = message.message;
        }

        var userId = null
        if(message.hasOwnProperty('teamCode') && message.teamCode !== ''){
          var teamCode = message.teamCode;
          if(teamCodeOverride){
            teamCode = teamCodeOverride
          }
          var team = Teams.findOne({teamCode: teamCode},{fields:{teamCode:1, users:1}});
          log.debug('TEAMID: ', team._id);
          messageAttributes.teamId = team._id;
          if(teamCodeOverride && message.hasOwnProperty('teamId') && message.teamId !== ''){
            message.teamId = team._id;
          }
          // userId = team.users[0];
        }

        if(message.hasOwnProperty('userId') && message.userId !== ''){
          messageAttributes.userId = message.userId;
        } else {
          messageAttributes.userId = userId;
        }

        if(message.hasOwnProperty('author') && message.author !== ''){
          messageAttributes.author = message.author;
        }

        if(message.hasOwnProperty('teamId') && message.teamId !== ''){
          messageAttributes.teamId = message.teamId;
        }

        if(message.hasOwnProperty('imageUrl') && message.imageUrl !== ''){
          messageAttributes.imageUrl = message.imageUrl;
        }

        if(!teamCodeOverride && message.hasOwnProperty('_id') && message._id !== ''){
          messageAttributes._id = message._id;
        }

        log.debug('CREATE MSG -- ATTRS', messageAttributes)

        ret.messages[message._id] = Meteor.call('createMessage', messageAttributes, false);
      })

      return ret;
    },

    importTeams: function(url) {
      if(undefined === url){
        url = Meteor.settings.SHEETSU.TEAMS
      }
      var ret = {
        'before': null,
        'teams': {},
        'after': null
      }
      ret.before = Teams.find().count();

      var response = Meteor.http.get(url, {timeout: 10000});
      var newTeams = response.data.result
      newTeams.forEach(function(team, idx) {
        if(team.hasOwnProperty('teamCode') === false){
          ret.teams[idx] = 'Missing teamCode.';
          return false
        }
        if(team.hasOwnProperty('process') === false){
          team.process = 'FALSE';
        }
        if(team.process === 'FALSE'){
          ret.teams[team.teamCode] = 'Process flag: ' + team.process;
          return false;
        }

        var orderEmails = team.orderEmails;
        if(Meteor.settings.APP.ENV !== 'production'){
          orderEmails = Meteor.settings.APP.SOUS_EMAIL;
        }

        var demoTeam = false;
        if(team.teamCode === Meteor.settings.APP.DEMO_TEAMCODE){
          demoTeam = true;
        }

        Teams.update(
          {teamCode: team.teamCode},
          {
            $set: Object.assign(team, {
              demoTeam: demoTeam,
              orderEmails: orderEmails,
              updatedAt: (new Date()).toISOString()
            }),
            $setOnInsert: {
              tasks: [],
              users: [],
              cart: EMPTY_CART, // TODO: remove this after all data transition to CartItems
              deleted: false,
              createdAt: (new Date()).toISOString()
            }
          },
          {upsert:true}
        );
        ret.teams[team.teamCode] = true;
      });

      ret.after = Teams.find().count();
      return ret;
    },

    importUsers: function(url) {
      var ret = {
        'before': null,
        'users': {},
        'after': null
      }
      ret.before = Meteor.users.find().count();

      var response = Meteor.http.get(url, {timeout: 10000});
      var newUsers = response.data.result
      newUsers.forEach(function(u) {
        if(u.hasOwnProperty('process') === false){
          u.process = 'FALSE';
        }
        if(u.process === 'FALSE'){
          ret.users[u.username] = 'Process flag: ' + u.process;
          return false;
        }
        if(u.username === ''){
          ret.users[u.email || u.firstName + ' ' + u.lastName] = 'Missing username...';
          return false;
        }
        log.debug(u)
        var userPkg = Meteor.call('getUserByPhoneNumber', u.username);
        var user = userPkg.user;

        // update user with some default data
        Meteor.users.update({_id: userPkg.userId}, {$set: {
          email: u.email,
          phone: u.phone || u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          superUser: (u.hasOwnProperty('superUser') === true && u.superUser === 'TRUE' ) ? true : false,
          imageUrl: (u.hasOwnProperty('imageUrl') === true) ? u.imageUrl : '',
          updatedAt: (new Date()).toISOString(),
        }})

        // associate with teams
        teams = u.teamCodes.replace(/^\s+|\s+$/g,"").split(/\s*,\s*/)
        var addDemoTeam = false;
        if(teams.indexOf(Meteor.settings.APP.DEMO_TEAMCODE) === -1){
          addDemoTeam = true;
        }
        if(u.hasOwnProperty('demoUser') && u.demoUser === 'FALSE'){
          addDemoTeam = false;
        }
        if(addDemoTeam === true){
          teams.push(Meteor.settings.APP.DEMO_TEAMCODE);
        }
        teams.forEach(function(teamCode) {
          log.debug(`adding ${u.firstName} to ${teamCode}`)
          var userTeams = Teams.find({users:{$in:[userPkg.userId]}}, {fields:{teamCode:1}}).fetch();
          var teamCodeFound = false;
          userTeams.forEach(function(team){
            if(team.teamCode === teamCode){
              teamCodeFound = true;
            }
          });
          if(teamCodeFound === false){
            // find the team, add user
            Teams.update(
              { teamCode: teamCode },
              {
                $push: { users: userPkg.userId },
                $set: {
                  deleted: false,
                  updatedAt: (new Date()).toISOString()
                }
              }
            );
          }
        })

        ret.users[u.username] = true;
      });

      ret.after = Meteor.users.find().count();
      return ret;
    },

    importPurveyors: function(teamCode, teamCodeOverride, url) {
      if(undefined === url){
        url = Meteor.settings.SHEETSU.PURVEYORS
      }
      if(undefined === teamCode){
        teamCode = 'all';
      }
      var ret = {
        'before': null,
        'purveyors': {},
        'after': null
      }
      ret.before = Purveyors.find().count();

      // insert purveyors with purveyorCode
      var response = Meteor.http.get(url, {timeout: 10000})
      log.debug('importPurveyors response:', response.data.result)
      response.data.result.forEach(function(purveyor) {
        if(purveyor.hasOwnProperty('teamCode') === false){
          ret.purveyors[purveyor.teamCode] = 'Missing teamCode';
          return false;
        }
        if(purveyor.hasOwnProperty('process') === false){
          purveyor.process = 'FALSE';
        }
        if(purveyor.process === 'FALSE'){
          ret.purveyors[purveyor.teamCode] = 'Process flag: ' + purveyor.process;
          return false;
        }

        if(teamCode !== undefined && teamCode !== 'all'){
          if(purveyor.teamCode !== teamCode){
            log.debug('Skipping teamCode: ' + purveyor.teamCode);
            return false;
          }
        }

        if(teamCodeOverride){
          purveyor.teamCode = teamCodeOverride
          purveyor._id = Purveyors._makeNewID();
          purveyor.purveyorCode = `${purveyor.purveyorCode}-${teamCodeOverride}`
        }

        ret.purveyors[purveyor.teamCode] = Meteor.call('importPurveyorsData', purveyor);
      });

      ret.after = Purveyors.find().count();
      return ret;
    },

    importPurveyorsData: function(purveyor) {

      var teamId = Teams.findOne({teamCode: purveyor.teamCode},{fields:{_id:1}});
      if(teamId === undefined){
        log.info('Unable to locate team for: ' + purveyor.teamCode);
        return false;
      } else {
        teamId = teamId._id;
      }

      var orderEmails = purveyor.orderEmails;
      if(Meteor.settings.APP.ENV !== 'production' && purveyor.teamCode !== Meteor.settings.APP.DEMO_TEAMCODE){
        orderEmails = Meteor.settings.APP.ORDER_EMAIL;
      }

      var purveyorLookup = { purveyorCode: purveyor.purveyorCode, teamId: teamId, };
      if(purveyor.hasOwnProperty('_id') === true){
        purveyorLookup = { _id: purveyor._id, teamId: teamId, };
      }

      var purveyorUpdate = {
        $set: {
          purveyorCode: purveyor.purveyorCode,
          teamId: teamId,
          teamCode: purveyor.teamCode,
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
          orderEmails: orderEmails,
          phone: purveyor.phone,
          orderContact: purveyor.orderContact,
          description: purveyor.description,
          sendEmail: (purveyor.sendEmail === "TRUE" ? true : false),
          sendFax: (purveyor.sendFax === "TRUE" ? true : false),
          fax: purveyor.fax,
          deleted: (purveyor.action === "REMOVE" ? true : false),
          updatedAt: (new Date()).toISOString()
        },
        $setOnInsert: {
          createdAt: (new Date()).toISOString()
        }
      };

      if(purveyor.hasOwnProperty('_id') === true){
        purveyorUpdate.$setOnInsert._id = purveyor._id
      }

      // upsert the purveyor
      Purveyors.update(
        purveyorLookup,
        purveyorUpdate,
        { upsert: true },
        Meteor.bindEnvironment(function() {
          log.info('Successfully imported: ' + purveyor.name)
        })
      )
      return true;
    },
    importSousDemoProducts: function() {
      importProducts('DEMO', undefined, Meteor.settings.SHEETSU.DEMO_PRODUCTS)
    },
    importProducts: function(importTeamCode, teamCodeOverride, url) {
      if(undefined === url){
        url = Meteor.settings.SHEETSU.PRODUCTS
      }
      if(undefined === importTeamCode){
        importTeamCode = 'all';
      }

      log.debug("importProducts METHOD ARGUMENTS: ", importTeamCode, teamCodeOverride, url);

      var ret = {
        teamCode: importTeamCode,
        'before': null,
        'products': {
          success: 0,
          errorProcess: 0,
          errorTeamCode: 0
        },
        'after': null,
        'removedCategories': null,
      }
      ret.before = Products.find().count();

      var response = Meteor.http.get(url, {timeout: 10000})
      // log.debug('importProducts response:', response)
      // get all purveyors
      var resultsLength = response.data.result.length;
      response.data.result.forEach(function(productRow, productRowIdx) {
        log.debug(`\n\n\n\n PROCESSING ${(productRowIdx+1)} of ${resultsLength} \n\n`)
        if(productRow.hasOwnProperty('process') === true && productRow.process === 'FALSE'){
          ret.products.errorProcess += 1;
          return false;
        }
        if(productRow.hasOwnProperty('teamCode') === false){
          ret.products.errorTeamCode += 1;
          return false;
        }

        if(importTeamCode !== undefined && importTeamCode !== 'all'){
          if(productRow.teamCode !== importTeamCode){
            log.debug('Skipping teamCode: ', productRow.teamCode);
            return false;
          }
        }

        var teamCode = productRow.teamCode;
        if(teamCodeOverride){
          teamCode = teamCodeOverride
          productRow.teamCode = teamCodeOverride
          delete productRow._id
        }

        var teamId = Teams.findOne({teamCode: teamCode},{fields:{_id:1}});
        if(teamId === undefined){
          return false
        } else {
          teamId = teamId._id;
        }

        var purveyorCodes = productRow.purveyors.split(',');
        var purveyors = []
        purveyorCodes.forEach(function(purveyorCode) {
          purveyorCode = _.trim(purveyorCode)
          if(teamCodeOverride){
            purveyorCode = `${purveyorCode}-${teamCodeOverride}`
          }
          purveyor = Purveyors.findOne({ purveyorCode: purveyorCode, teamCode: teamCode });
          if(purveyor !== undefined){
            log.debug('PURVEYOR ID: ', purveyor._id);
            purveyors.push(purveyor._id);
          } else {
            log.debug('PURVEYOR NOT FOUND: ', purveyorCode);
          }
        })

        log.debug('SETTING PURVEYORS: ', purveyors)

        var productAction = 'UPDATE';
        if(productRow.hasOwnProperty('action') === true && productRow.action !== ''){
          productAction = productRow.action;
        }

        if(productAction === 'REMOVE'){
          if(productRow.hasOwnProperty('_id') === true){
            Products.update({ _id: productRow._id }, {$set: {
              deleted: true,
              updatedAt: (new Date()).toISOString(),
              deletedAt: (new Date()).toISOString(),
            }});
            // NOTE: Requires client side to be able to respond to the flag
            var singleProductCategory = Categories.findOne({products:{$in:[productRow._id]}});
            if(singleProductCategory !== undefined){
              var updatedProducts = singleProductCategory.products;
              var productIdx = updatedProducts.indexOf(productRow._id);
              if(productIdx !== -1){
                updatedProducts = singleProductCategory.products.slice(0, productIdx);
                updatedProducts = updatedProducts.concat(singleProductCategory.products.slice(productIdx+1));
              }
              Categories.update({_id: singleProductCategory._id},{$set:{
                products: updatedProducts,
                updatedAt: (new Date()).toISOString()
              }});
            }
          } else {
            log.debug('UNABLE TO REMOVE PRODUCT - missing _id: ', productRow)
          }
        } else {

          var newProductAttributes = {
            name: productRow.name,
            teamId: teamId,
            teamCode: productRow.teamCode,
            description: productRow.description,
            price: productRow.price,
            purveyors: purveyors,
            amount: productRow.amount,
            unit: productRow.unit,
            par: productRow.par,
            sku: productRow.sku ? productRow.sku.toString() : '',
            packSize: productRow.packSize || '',
            deleted: false,
            createdAt: (new Date()).toISOString(),
            updatedAt: (new Date()).toISOString()
          };

          if(productRow.hasOwnProperty('_id') === true){
            newProductAttributes._id = productRow._id;
          } else {
            newProductAttributes._id = Products._makeNewID();
          }

          var productLookup = { name: productRow.name, teamId: teamId };
          if(newProductAttributes.hasOwnProperty('_id') === true && newProductAttributes._id !== '#N/A' && newProductAttributes._id !== ''){
            productLookup = { _id: newProductAttributes._id, teamId: teamId };
          }

          log.debug('Product lookup: ', productLookup);

          var productResult = Meteor.call('createProduct', newProductAttributes, productLookup);
          log.debug('productResult: ', productResult);
          if (productRow.category !== '') {
            log.debug('updating productRow category:', productRow.category);

            var categoryLookup = { name: productRow.category, teamId: teamId};
            var category = Categories.findOne(categoryLookup);
            if(category === undefined){
              var categoryAttributes = {
                name: productRow.category,
                teamId: teamId,
                teamCode: productRow.teamCode,
                products: [newProductAttributes._id],
                deleted: false,
                createdAt: (new Date()).toISOString(),
                updatedAt: (new Date()).toISOString()
              };
              var categoryResult = Meteor.call('createCategory', categoryAttributes, categoryLookup);
              log.debug('categoryResult: ', categoryResult)
              category = categoryResult.category;
            }

            var addProductCategoryResult = Meteor.call('addProductCategory', categoryLookup, newProductAttributes._id);

          } // end if productRow.category is not blank

        }
        ret.products.success += 1;
      }); // end response.data.result.forEach

      ret.after = Products.find().count();
      ret.removedCategories = Categories.remove({products: {$size: 0}});
      return ret;
    },

    exportPurveyors: function() {
      var ret = {
        success: null,
        purveyors: {
          count: null
        },
        remove: null,
        import: null,
      }
      ret.remove = Export.remove({})
      var purveyorOptions = {}
      // purveyorOptions = {limit:10};
      var allPurveyors = Purveyors.find({},purveyorOptions).fetch();
      ret.purveyors.count = allPurveyors.length;
      ret.import = 0

      allPurveyors.forEach(function(purveyor) {
        var exportPurveyorAttributes = {
          process: 'TRUE',
          action: (purveyor.deleted === true ? 'REMOVE' : ''),
          _id: purveyor._id,
          teamCode: purveyor.teamCode,
          purveyorCode: purveyor.purveyorCode,
          name: purveyor.name,
          timeZone: purveyor.timeZone,
          orderCutoffTime: purveyor.orderCutoffTime,
          orderMinimum: purveyor.orderMinimum,
          deliveryDays: purveyor.deliveryDays,
          notes: purveyor.notes,
          email: purveyor.email,
          phone: purveyor.phone,
          orderEmails: purveyor.orderEmails,
          orderContact: purveyor.orderContact,
          description: purveyor.description,
          sendEmail: (purveyor.sendEmail === true ? 'TRUE' : 'FALSE'),
        };
        log.debug("PURVEYOR EXPORT: ", exportPurveyorAttributes)
        Export.insert(exportPurveyorAttributes);
        ret.import += 1;
      })

      return ret;
    },

    exportProducts: function() {
      var ret = {
        success: null,
        products: {
          count: null
        },
        remove: null,
        import: null,
      }
      ret.remove = Export.remove({})
      var productOptions = {}
      // productOptions = {limit:10};
      var allProducts = Products.find({},productOptions).fetch();
      var allCategories = Categories.find().fetch();
      var allPurveyors = Purveyors.find().fetch();
      ret.products.count = allProducts.length;
      ret.import = 0

      allProducts.forEach(function(product) {
        var categoryName = _.filter(allCategories, function(category){
          return category.products.indexOf(product._id) !== -1
        });
        var purveyorCodes = _.map(_.filter(allPurveyors, function(purveyor){
          return product.purveyors.indexOf(purveyor._id) !== -1
        }), function(purveyor) {
          return purveyor.purveyorCode;
        });
        var exportProductAttributes = {
          process: 'TRUE',
          _id: product._id,
          action: (product.deleted === true ? 'REMOVE' : ''),
          name: product.name,
          teamCode: product.teamCode,
          category: (categoryName[0]) ? categoryName[0].name : '',
          purveyors: purveyorCodes.join(','),
          amount: product.amount,
          unit: product.unit,
          par: product.par || '',
          sku: product.sku || '',
          description: product.description,
          price: product.price,
          packSize: product.packSize || '',
        };
        log.debug("PRODUCT EXPORT: ", exportProductAttributes)
        Export.insert(exportProductAttributes);
        ret.import += 1;
      })

      return ret;
    },

    importTeamTasks: function(importTeamCode, teamCodeOverride, url) {
      if(undefined === importTeamCode){
        importTeamCode = 'all';
      }
      var ret = {
        'tasks': {}
      }
      var response = Meteor.http.get(url, {timeout: 10000});
      var newTeamTasks = response.data.result
      newTeamTasks.forEach(function(task, idx) {
        if(task.hasOwnProperty('teamCode') === false){
          ret.tasks[task.recipeId] = 'Missing teamCode.';
          return false
        }
        if(task.hasOwnProperty('process') === false){
          task.process = 'FALSE';
        }
        if(task.process === 'FALSE'){
          ret.tasks[task.recipeId] = 'Process flag: ' + task.process;
          return false;
        }

        if(importTeamCode !== undefined && importTeamCode !== 'all'){
          if(task.teamCode !== importTeamCode){
            log.debug('Skipping teamCode: ' + task.teamCode);
            return false;
          }
        }

        var teamId = null;
        var userId = null;
        if(task.hasOwnProperty('teamCode') && task.teamCode !== ''){
          var teamCode = task.teamCode;
          if(teamCodeOverride){
            teamCode = teamCodeOverride
          }
          var team = Teams.findOne({teamCode: teamCode},{fields:{teamCode:1,users:1}});
          teamId = team._id;
          userId = team.users[0]
        }

        var taskAttributes = {
          recipeId: task.recipeId,
          name: task.name,
          description: task.description.replace('\n',"\n"),
          deleted: (task.deleted === 'TRUE' ? true : false),
          completed: (task.completed === 'TRUE' ? true : false),
          quantity: parseInt(task.quantity),
          unit: task.unit ? parseInt(task.unit) : 0,
        }
        taskAttributes.unit = taskAttributes.unit || 0;

        ret.tasks[task.recipeId] = Meteor.call('addTeamTask', userId, teamId, taskAttributes)
      })

      return ret;

    },

    sendWelcomeMessage: function(userId, teamId) {
      var ret = {
        success: false,
        userId: userId,
        teamId: teamId,
        messageId: null,
        message: null,
        status: null, // STATUS.MESSAGE
      }
      var welcomeMsg = Messages.findOne({userId: userId, teamId: teamId, welcome: true})
      if(welcomeMsg !== undefined){
        ret.status = STATUS.MESSAGE.EXISTING;
        ret.messageId = welcomeMsg._id;
        ret.message = welcomeMsg;
        ret.success = true;
      } else {
        ret.status = STATUS.MESSAGE.NEW;
        var messageAttributes = {
          message: 'Welcome to Sous! This is your personal Notepad, but you can create a new team and start collaborating with your fellow cooks by tapping the icon in the top right.',
          userId: userId,
          author: 'Sous',
          teamId: teamId,
          welcome: true,
          createdAt: (new Date()).toISOString(),
          imageUrl: 'https://sous-assets-production.s3.amazonaws.com/uploads/89b217dc-4ec5-43e8-9569-8fc85e6fdd52/New+Sous+Logo+Circle+Small.png',
        }
        var createMessage = Meteor.call('createMessage', messageAttributes);
        ret.messageId = createMessage.messageId;
        ret.message = Messages.findOne({_id: ret.messageId});
        ret.success = true;
      }
      return ret;
    },

    getUserNotepad: function(userId) {
      var ret = {
        success: false,
        userId: userId,
        teamId: null,
        team: null,
        welcomeMessage: null,
        status: null, // STATUS.NOTEPAD
      }
      var notepad = Teams.findOne({notepad: true, users: {$in: [userId]}});

      if(notepad !== undefined){
        ret.status = STATUS.NOTEPAD.EXISTING;
        ret.teamId = notepad._id;
        ret.team = notepad;
        ret.success = true;
      } else {
        ret.status = STATUS.NOTEPAD.NEW;
        ret.teamId = Teams.insert({
          name: 'Notepad',
          tasks: [],
          cart: EMPTY_CART, // TODO: remove this after all data transition to CartItems
          users: [userId],
          notepad: true,
          deleted: false,
          createdAt: (new Date()).toISOString(),
          updatedAt: (new Date()).toISOString(),
        });
        ret.success = true;
      }

      // send the welcome message
      ret.welcomeMessage = Meteor.call('sendWelcomeMessage', ret.userId, ret.teamId);

      return ret;
    },

    createDemoTeam: function(userId, teamId) {
      log.debug("CREATING DEMO TEAM - userId: ", userId, ' teamId: ', teamId);
      var ret = {
        success: false,
        userId: userId,
        teamId: teamId,
        import: {},
      }

      var team = Teams.findOne({_id: teamId});

      ret.import.purveyors = Meteor.call('importPurveyors', Meteor.settings.APP.DEMO_TEAMCODE, team.teamCode, Meteor.settings.SHEETSU.DEMO_PURVEYORS);
      ret.import.products = Meteor.call('importProducts', Meteor.settings.APP.DEMO_TEAMCODE, team.teamCode, Meteor.settings.SHEETSU.DEMO_PRODUCTS);
      ret.import.teamTasks = Meteor.call('importTeamTasks', Meteor.settings.APP.DEMO_TEAMCODE, team.teamCode, Meteor.settings.SHEETSU.DEMO_TASKS);

      ret.success = true;

      return ret;
    },

    getUserByPhoneNumber: function(phoneNumber) {
      var ret = {
        success: false,
        userId: null,
        user: null,
        notepadExists: false,
        status: null, // STATUS.USER
      }
      //phoneNumber = sanitizeString(phoneNumber);
      var addPlus = false
      if(phoneNumber.substr(0,1) === '+'){
        addPlus = true
      }
      phoneNumber = phoneNumber.toString().replace(/\D/g, '');

      if(phoneNumber.length === 11 && phoneNumber[0] === '1'){
        if(addPlus === true){
          phoneNumber = `+${phoneNumber}`
        } else {
          phoneNumber = phoneNumber.slice(1)
        }
      }

      var user = Meteor.users.findOne({username: phoneNumber});

      // found the user
      if (user !== undefined) {
        ret.status = STATUS.USER.EXISTING;
        ret.userId = user._id;
        ret.user = Meteor.users.findOne({_id: ret.userId});
        // // make sure that Notepad exists
        // ret.notepadExists = Meteor.call('getUserNotepad', ret.userId);
        ret.success = true;
      }
      // create a new user
      else {
        ret.status = STATUS.USER.NEW;
        log.debug('creating new user associated with ' + phoneNumber)
        ret.userId = Accounts.createUser({ username: phoneNumber, });

        let teamId = null
        // make sure that Notepad exists
        // ret.notepadExists = Meteor.call('getUserNotepad', ret.userId);
        // teamId = ret.notepadExists.teamId

        Meteor.users.update({_id: ret.userId}, {$set: {
          teamId: teamId,
          email: "",
          firstName: "",
          lastName: "",
          imageUrl: "",
          viewedOnboarding: false,
          notifications: false,
          superUser: false,
          smsTokenCount: 0,
          smsToken: null,
          smsSent: false,
          smsVerified: false,
          authToken: null,
          createdAt: (new Date()).toISOString(),
          updatedAt: (new Date()).toISOString(),
        }});

        ret.user = Meteor.users.findOne({_id: ret.userId}); // ---

        ret.success = true;
      }

      return ret;
    },

    resetUserByPhoneNumber: function(phoneNumber) {
      var user = Meteor.users.findOne({username: phoneNumber});
      if (user !== undefined) {
        return Meteor.call('resetUser', user._id)
      }
      return {
        success: false,
        error: [{
          msg: `Could not locate user by phone number: ${phoneNumber}`
        }]
      }
    },

    resetUser: function(userId) {

      //reset user app state
      Meteor.users.update({_id:userId}, {$set: {
        resetAppState: true,
        updatedAt: (new Date()).toISOString(),
      }})

      //get userId, remove from teams
      var teams = Teams.find({users: {$in: [userId]}},{fields:{_id:1}}).fetch();
      teams.forEach(function(team){
        Meteor.call('removeUserFromTeam', userId, team._id)
      })

      //clear out user's data
      setTimeout(Meteor.bindEnvironment(function(){
        //clear out user's data
        Meteor.users.update({_id:userId}, {$set: {
          teamId: null,
          firstName: '',
          lastName: '',
          email: '',
          resetAppState: false,
          viewedOnboarding: false,
          updatedAt: (new Date()).toISOString(),
        }})
      }), 1500)

      return {
        userId: userId,
        success: true,
      }
    },



    getTeamOrderGuide: function(teamId) {
      var ret = {
        purveyors: Purveyors.find({teamId: {$in: [teamId]}}).fetch(),
        categories: Categories.find({teamId: {$in: [teamId]}}).fetch(),
        products: Products.find({teamId: {$in: [teamId]}}).fetch(),
      }
      return ret;
    },

    getUsersTeams: function(userId) {
      return Teams.find({users: {$in: [userId]}}).fetch();
    },

    getTeamByCode: function(teamCode) {
      return Teams.findOne({teamCode: teamCode});
    },

    removeUserFromTeamsByTeamCodes: function(phoneNumber, teamCodes) {
      if(undefined === teamCodes){
        teamCodes = 'all';
      }
      log.debug("Removing user: ", phoneNumber, " from team(s): ", teamCodes);

      var userPkg = Meteor.call('getUserByPhoneNumber', phoneNumber);
      log.debug('userId: ', userPkg.userId)
      if (teamCodes === 'all') {
        allTeams = Teams.find(
          { users: { $in: [userPkg.userId] } }
        ).fetch();
        log.debug('allTeams: ', allTeams)
        teamCodes = _.pluck(allTeams, 'teamCode');
        log.debug('TEAM CODES TO REMOVE FROM: ', teamCodes)
      }

      teamCodes.forEach(function(teamCode){
        var team = Teams.findOne({teamCode:teamCode},{fields:{users:1}});
        var remove = Meteor.call('removeUserFromTeam', userPkg.userId, team._id)
        log.debug(remove)
      })
    },

    removeUserFromTeam: function(userId, teamId){
      log.debug("Removing user: " + userId + " from team: " + teamId);
      var ret = {
        remove: null,
        missing: null,
      };
      var team = Teams.findOne({_id: teamId},{fields:{users:1}});
      var idx = team.users.indexOf(userId);
      if(idx !== -1){
        var teamUsers = team.users.slice(0, idx);
        teamUsers = teamUsers.concat(team.users.slice(idx+1));
        ret.remove = Teams.update({_id: teamId}, {$set:{
          users: teamUsers,
          updatedAt: (new Date()).toISOString(),
        }});
        ret.missing = false;
        log.debug('REMOVE FROM team: ', teamId, ret.remove, ' update with: ', teamUsers);
      } else {
        ret.remove = false;
        ret.missing = true;
        log.debug("Team does not contains user: ", userId);
      }
      return ret;
    },

    addUserToTeamCodes: function(phoneNumber, teamCodes) {
      if(undefined === teamCodes){
        teamCodes = 'all';
      }
      var ret = {
        result: null,
        phoneNumber: phoneNumber,
        teamCodes: teamCodes,
      };

      log.debug("Adding user: ", phoneNumber, " to team(s): ", teamCodes);

      var userPkg = Meteor.call('getUserByPhoneNumber', phoneNumber);

      if(teamCodes === 'all'){
        allTeams = Teams.find({users:{$in:[userPkg.userId]},notepad:{$exists:false}},{fields:{_id:1}}).fetch();
        teamCodes = _.pluck(allTeams, 'teamCode');
        log.debug('TEAM CODES TO ADD TO: ', teamCodes)
      }

      teamCodes.forEach(function(teamCode){
        var team = Teams.findOne({teamCode:teamCode},{fields:{users:1}});
        ret.result = Meteor.call('addUserToTeam', userPkg.userId, team._id);
      })

      return ret;
    },

    addUserToTeam: function(userId, teamId){
      log.debug("Adding user: " + userId + " to team: " + teamId);
      var ret = {
        update: null,
        exists: null,
      };
      var team = Teams.findOne({_id: teamId});
      if(team.users.indexOf(userId) === -1){
        // Add the user to the team
        ret.update = Teams.update({_id: teamId}, {
          $push: {users: userId},
          $set: {updatedAt: (new Date()).toISOString()}
        });
        ret.exists = false
        log.debug("Team updated: ", ret.update);
      } else {
        ret.exists = true;
        ret.update = 0;
        log.debug("Team already contains user: ", ret.exists);
      }
      return ret;
    },

    sendSMSInvite: function(phoneNumber, teamId, invitorUserId) {
      var invitor = Meteor.users.findOne({ _id: invitorUserId });
      var downloadURL = Meteor.settings.APP.ITUNES_URL;
      var twilio = new Twilio(
        Meteor.settings.TWILIO.SID,
        Meteor.settings.TWILIO.TOKEN
      );
      var bodyMessage = '';

      // Get the user by their phone number
      var invitee = Meteor.call('getUserByPhoneNumber', phoneNumber);

      if (invitee.status === STATUS.USER.NEW) {
        bodyMessage = invitor.firstName + ' ' + invitor.lastName[0] + '. invited you to Sous - ' + downloadURL;
      } else {
        var team = Teams.findOne({_id: teamId});
        bodyMessage = invitor.firstName + ' ' + invitor.lastName[0] + ' is inviting you to ' + team.name + ' - ' + downloadURL;
      }

      Meteor.call('addUserToTeam', invitee.userId, teamId);

      twilio.sendSms({
        to: phoneNumber,
        from: Meteor.settings.TWILIO.FROM,
        body: bodyMessage
      }, Meteor.bindEnvironment( function(err, responseData) {
        if (err) {
          Meteor.call('triggerError',
            'technical-error:sms',
            err.message,
            invitor._id
          )
        }
      }.bind(this)))

      return {
        success: true,
        invitorUserId: invitorUserId,
        invitee: invitee,
        phoneNumber: phoneNumber,
        teamId: teamId,
      }
    },

    sendSMSCode: function(phoneNumber, authToken){
      // log.debug('sendSMSCode args: ', arguments)
      // Get the user by their phone number
      var ret = {}
      var userPkg = Meteor.call('getUserByPhoneNumber', phoneNumber);
      var user = userPkg.user;
      ret.userId = user._id;

      var sendSmsToken = true;
      if(null !== authToken && authToken === user.authToken){
        sendSmsToken = false;
        Meteor.users.update({_id: user._id}, {$set: {
          // smsSent: false,
          smsVerified: true,
          resetAppState: false,
          smsTokenCount: 0,
          updatedAt: (new Date()).toISOString(),
        }});
      } else {
        Meteor.users.update({_id: user._id}, {$set: {
          authToken: null,
          // smsSent: false,
          resetAppState: false,
          smsVerified: false,
          updatedAt: (new Date()).toISOString(),
        }});
      }

      if(sendSmsToken === true){
        var twilio = new Twilio(
          Meteor.settings.TWILIO.SID,
          Meteor.settings.TWILIO.TOKEN
        )
        var smsToken = Math.floor(1000 + Math.random() * 9000)
        log.info('sending smsToken to ' + phoneNumber + ': ' + smsToken)
        twilio.sendSms({
          to: phoneNumber,
          from: Meteor.settings.TWILIO.FROM,
          body: 'Your Sous verification code is ' + smsToken
        }, Meteor.bindEnvironment(function(err, responseData) {
          // log.error('err: ', err)
          if (!err) {

            log.debug('SMS sid: ' + responseData.sid);

            Meteor.users.update(
              {_id: user._id},
              { $set: {
                  smsToken: smsToken,
                  smsSent: true,
                  smsSID: responseData.sid,
                  smsVerified: false,
                  updatedAt: (new Date()).toISOString(),
                }
              }
            );
            user = Meteor.users.findOne({_id: user._id});
            log.debug('Updated:', user)

            if (user.superUser !== true) {
              var team = Teams.findOne({_id: user.teamId});
              var slackAttachment = [
                {
                  fields: [
                    {
                      title: 'Name',
                      value: `${user.firstName} ${user.lastName}` || 'N/A',
                      short: true
                    },
                    {
                      title: 'Team Name',
                      value: team.name,
                      short: true
                    },
                    {
                      title: 'Email',
                      value: user.email || 'N/A',
                      short: true
                    },
                    {
                      title: 'Phone Number',
                      value: user.username,
                      short: true
                    },
                  ]
                }
              ]

              slack.alert({
                username: 'Sous App',
                channel: '#app-actions',
                text: `SMS Request`,
                attachments: slackAttachment,
                icon_emoji: ":iphone:",
              });
            }
          } else {
            Meteor.call('triggerError',
              'technical-error:sms',
              err.message,
              user._id
            );
            Meteor.users.update(
              {_id: user._id},
              { $set: {
                  smsToken: null,
                  smsSent: false,
                  smsVerified: false,
                  updatedAt: (new Date()).toISOString(),
                }
              }
            );
          }
        }))
      }
      return ret;
    },

    loginWithSMS: function(userId, token){
      log.info('LOGIN WITH SMS: ', userId, token)
      var ret = {
        userId: userId,
      }
      // Get the user by their userId
      var user = Meteor.users.findOne({_id:userId});
      if(user === undefined){
        // Get the user by their userId
        var userPkg = Meteor.call('getUserByPhoneNumber', userId);
        log.info('LOGIN WITH PHONE NUMBER: ', userId, token)
        user = userPkg.user;
        ret.userId = user._id;
      }

      // if the user exists and the token matches, set the user's token and return the user
      log.debug('USER: ', user);
      if (user.smsToken === parseInt(token.trim())) {
        //TODO: Double check into Accounts.getNewToken() instead..
        //https://github.com/meteor/meteor/blob/master/packages/accounts-base/accounts_server.js
        var stampedToken = Accounts._generateStampedLoginToken();
        // from: https://meteorhacks.com/extending-meteor-accounts
        var hashStampedToken = Accounts._hashStampedToken(stampedToken);
        log.debug('TOKEN: ', hashStampedToken);
        Meteor.users.update({_id: user._id}, { $set: {
          smsVerified: true,
          authToken: hashStampedToken,
          smsTokenCount: 0, // reset it back to 0 on successful login
          updatedAt: (new Date()).toISOString(),
        }})
        if (user.superUser !== true) {
          // notify Sous
          var team = Teams.findOne({_id: user.teamId});
          var slackAttachment = [
            {
              fields: [
                {
                  title: 'Name',
                  value: `${user.firstName} ${user.lastName}`,
                  short: true
                },
                {
                  title: 'Team Name',
                  value: team.name,
                  short: true
                },
                {
                  title: 'Email',
                  value: user.email,
                  short: true
                },
                {
                  title: 'Phone Number',
                  value: user.username,
                  short: true
                },
              ]
            }
          ]

          slack.alert({
            username: 'Sous App',
            channel: '#app-actions',
            text: `SMS Login`,
            attachments: slackAttachment,
            icon_emoji: ":iphone:",
          });
        }
      } else {
        Meteor.users.update({_id: user._id}, {$set: {
          authToken: null,
          smsToken: null,
          smsSent: false,
          smsVerified: false,
          smsTokenCount: (user.smsTokenCount + 1),
          updatedAt: (new Date()).toISOString(),
        }});
        Meteor.call('triggerError',
          'verification-error',
          'Invalid token',
          user._id
        )
      }
      return ret;
    },

    updateUser: function(userId, userAttributes) {
      //TODO: prevent updates of critical attributes, smsToken, authToken, etc..
      log.debug("UPDATE USER ATTRS", userId, JSON.stringify(userAttributes));
      userAttributes.updatedAt = (new Date()).toISOString();
      var update = Meteor.users.update({_id: userId}, {$set:userAttributes})
      var teamsUpdate = null;

      if (
        userAttributes.hasOwnProperty('firstName')
        || userAttributes.hasOwnProperty('lastName')
        || userAttributes.hasOwnProperty('phone')
        || userAttributes.hasOwnProperty('email')
      ){
        teamsUpdate = Teams.update({users: {$in: [userId]}},{$set:{
          updatedAt: (new Date()).toISOString(),
        }},{multi: true})

        var user = Meteor.users.findOne({_id: userId});
        if (user.superUser === false){
          var team = Teams.findOne({_id: user.teamId});
          let slackAttachmentFields = []
          for (var property in userAttributes) {
            if (userAttributes.hasOwnProperty(property)) {
              slackAttachmentFields.push({
                title: property || 'Error: property not found',
                value: userAttributes[property] || 'Error: value not found',
                short: true
              })
            }
          }
          slackAttachmentFields.push({
            title: 'Team Name',
            value: team.name,
            short: true
          })
          const slackAttachments = [
            {
              title: 'User Update',
              fields: slackAttachmentFields
            }
          ]
          slack.alert({
            username: `Sous App ${userId}`,
            channel: '#app-actions',
            text: 'User update',
            attachments: slackAttachments,
            icon_emoji: ':iphone:'
          });
        }
      }

      log.debug('UPDATE: ', update, ' with: ', userAttributes)
      return {
        user: Meteor.users.findOne({_id: userId}),
        update: update,
        teamsUpdate: teamsUpdate,
      };
    },

    triggerError: function(machineKey, msg, userId, errorId, data) {
      log.error('TRIGGER NEW ERROR: ', machineKey, msg, errorId, ' USERID: ', userId);

      var newErrorAttributes = {
        userId: userId,
        machineKey: machineKey,
        message: msg,
        author: 'Sous',
        imageUrl: 'https://sous-assets-production.s3.amazonaws.com/uploads/89b217dc-4ec5-43e8-9569-8fc85e6fdd52/New+Sous+Logo+Circle+Small.png',
        createdAt: (new Date()).toISOString(),
      }
      if(errorId){
        newErrorAttributes._id = errorId
      }
      var errorId = Errors.insert(newErrorAttributes);

      // alert the Sous team in Slack (only for the short term)
      var user = Meteor.users.findOne({ _id: userId });
      var dataString = ''
      if(data){
        dataString = "\n" + '```' + JSON.stringify(data, null, 2) + '```'
      }
      slack.alert({
        username: 'errorBot',
        channel: '#dev-errors',
        icon_emoji: ':warning:',
        text: `Client Error triggered by (firstName: ${user.firstName}) (username: ${user.username}) (email: ${user.email}): ${msg} ${dataString}`,
        attachments: null
      });

      return {
        success: false,
        errorId: errorId,
        machineKey: machineKey,
        userId: userId,
      }
    },

    deleteErrors: function(errorIdList) {
      log.debug('deleteErrors called with errorIdList: ', errorIdList)
      errorIdList.forEach(function(errorId) {
        Errors.remove({_id: errorId})
      })
    },

    // createMessage method
    createMessage: function(messageAttributes, dontTriggerPushNotification) {
      if(undefined === dontTriggerPushNotification){
        dontTriggerPushNotification = true
      }
      log.debug("MESSAGE ATTRS: ", messageAttributes, " triggering push notification: ", dontTriggerPushNotification);
      if(messageAttributes.imageUrl === ""){
        messageAttributes.imageUrl = "https://lh3.googleusercontent.com/-8e1m8YBYSe0/AAAAAAAAAAI/AAAAAAAAAAA/jRTl40sO4fM/s40/photo.jpg"
      }
      messageAttributes.updatedAt = (new Date()).toISOString();
      var messageId = Messages.insert(messageAttributes);
      log.debug("NEW MESSAGE", messageId);
      var message = `${messageAttributes.author}: ${messageAttributes.message}`
      switch(messageAttributes.type){
        case 'orderConfirmation':
            message = `${messageAttributes.purveyor} order received by ${messageAttributes.author}.`
      }

      if(dontTriggerPushNotification === true){
        Meteor.call('triggerPushNotification', message, messageAttributes.teamId, messageAttributes.userId)
      }

      if (Meteor.call('sendSlackNotification', messageAttributes.teamId)) {
        let teamName = Teams.findOne({_id: messageAttributes.teamId}).name
        const slackAttachments = [
          {
            title: 'Chat',
            fields: [
              {
                title: 'Team',
                value: teamName || 'Error: Team Name not found',
                short: true
              },
              {
                title: 'Author',
                value: messageAttributes.author || 'Error: Author not found',
                short: true
              },
              {
                title: 'Message',
                value: messageAttributes.message || message || 'Error: Message not found',
                short: true
              },
            ]
          }
        ]

        slack.alert({
          username: `Sous App ${messageAttributes._id}`,
          channel: '#app-actions',
          text: 'Chat',
          attachments: slackAttachments,
          icon_emoji: ':iphone:'
        });
      }

      return {
        success: true,
        messageId: messageId
      }
    },

    getTeamMessages: function(teamId, messageDate, sinceDate){
      var createdAtLogic = { $lte: messageDate };
      var queryOptions = {
        sort: { createdAt: -1 },
        limit: 20
      };
      var query = {
        teamId: teamId,
        createdAt: createdAtLogic
      };
      if(sinceDate !== undefined && sinceDate === true){
        createdAtLogic = { $gte: messageDate };
        queryOptions = {
          sort: { createdAt: -1 }
        };
      }
      log.trace("Retrieving messages, with query: ", query, " queryOptions: ", queryOptions);
      return Messages.find(query,queryOptions).fetch();
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

    createTeam: function(teamAttributes, userId) {
      log.debug("TEAM ATTRS", teamAttributes);
      var team = Teams.findOne({_id: teamAttributes._id, name: teamAttributes.name});
      var user = Meteor.users.findOne({ _id: userId });
      if(team === undefined){
        if(teamAttributes.hasOwnProperty('createdAt') === false){
          teamAttributes.createdAt = (new Date()).toISOString();
        }

        var messageType = 'welcome'

        if(teamAttributes.demoTeam){
          teamAttributes.name = teamAttributes.name.replace('Team', 'Demo Team')
          teamAttributes.teamCode = `${teamAttributes.teamCode}DEMO${Math.floor(1000 + Math.random() * 9999)}`
          messageType = 'demo-welcome'
          teamAttributes.phone = user.username
          teamAttributes.address = '123 Main St.'
          teamAttributes.city = 'City'
          teamAttributes.state = 'ST'
          teamAttributes.zipCode = '00000'
        }

        // TODO: remove this after all data transition to CartItems
        teamAttributes.cart = EMPTY_CART;
        teamAttributes.updatedAt = (new Date()).toISOString();
        var teamId = Teams.insert(teamAttributes);
        var messageAttributes = {
            type: messageType,
            author: 'Sous',
            teamId: teamId,
            createdAt: (new Date()).toISOString(),
            imageUrl: 'https://sous-assets-production.s3.amazonaws.com/uploads/89b217dc-4ec5-43e8-9569-8fc85e6fdd52/New+Sous+Logo+Circle+Small.png',
            message: 'Welcome to Sous!'
          }
        // TODO: Refactor to use common message library
        Messages.insert(messageAttributes)

        if(teamAttributes.demoTeam){
          Meteor.call('createDemoTeam', userId, teamId);
        }

        var team = Teams.findOne({_id: teamId});
        log.debug("CREATED TEAM", team);
      } else {
        log.error("Team already exists");
        // TODO: publish an error
      }
    },

    updateTeam: function(teamId, teamAttributes) {
      var originalTeamAttrs = JSON.stringify(teamAttributes, null, 2);
      log.debug("UPDATE TEAM ATTRS", originalTeamAttrs);
      var realTeamId = {_id: teamId};
      if(teamAttributes.hasOwnProperty('users') === true){
        delete teamAttributes.users;
        var team = Teams.findOne({_id: teamId}, {fields: {name: 1, teamCode: 1, users: 1}})
        var teamAttrsString = "```" + originalTeamAttrs + "```"
        var teamString = "```" + JSON.stringify(team, null, 2) + "```"
        slack.alert({
          username: 'errorBot',
          channel: '#dev-errors',
          icon_emoji: ':boom:',
          text: `Team attributes affecting ${teamId} - \n Replace USER Attrs: \n ${teamAttrsString} \n Team USER Attrs Safe: \n ${teamString}`,
          attachments: null
        });
      }
      teamAttributes.updatedAt = (new Date()).toISOString();
      return Teams.update(realTeamId, {$set: teamAttributes});
    },

    addTeamTask: function(userId, teamId, taskAttributes) {
      var ret = {
        'success': null
      }
      var realTeamId = {_id: teamId};
      log.debug("TEAM ID ", teamId);
      log.debug("TASK ATTRS ", taskAttributes);
      var teamHasTask = Teams.findOne({_id: teamId, "tasks.name": taskAttributes.name},{id:1})
      log.debug("TEAM ALREADY HAS TASK: ", (teamHasTask !== undefined ? true : false));
      if(teamHasTask === undefined){
        var update = Recipes.update(
          {_id:taskAttributes.recipeId},
          {
            $set: {
              name: taskAttributes.name,
              updatedAt: (new Date()).toISOString(),
            },
            $setOnInsert: {
              _id: taskAttributes.recipeId,
              ingredients: [], // for future use
              createdAt: (new Date()).toISOString(),
            }
          }
        );
        Teams.update(realTeamId, {
          $push: {tasks: taskAttributes},
          $set: {updatedAt: (new Date()).toISOString()}
        });
        ret.success = true
      } else {
        Meteor.call('triggerError',
          'add-error',
          'Team task already exists',
          userId
        )
        ret.success = false;
      }
      return ret
    },

    updateTeamTask: function(teamId, recipeId, taskAttributes){
      log.debug("TEAM ID ", teamId);
      log.debug("RECIPE ID ", recipeId);
      log.debug("TASK ATTRS ", taskAttributes);
      var realTeamId = {_id: teamId};
      var team = Teams.findOne(realTeamId);
      if(team){
        // needed to add: meteor add maxharris9:object-assign
        // var taskIdx = _.findIndex(team.tasks, function(task) {
        //   return task.recipeId === recipeId
        // });
        var taskIdx;
        // log.debug("TEAM", team);
        team.tasks.forEach(function(task, index) {
          if (task.recipeId == recipeId)
            taskIdx = index;
        });
        team.tasks[taskIdx] = Object.assign({}, team.tasks[taskIdx], taskAttributes);
        Teams.update(realTeamId, {
          $set: {
            tasks: team.tasks,
            updatedAt: (new Date()).toISOString(),
          }
        });
      }
      team = Teams.findOne({_id: teamId});
      log.debug("UPDATED TEAM", team);
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
      log.trace("Retrieving cart items, with query: ", query, " queryOptions: ", queryOptions);
      return CartItems.find(query, queryOptions).fetch();
    },

    getTeamUsers: function(userId, teamId){
      log.debug("GET TEAM USERS - userId: ", userId, " teamId: ", teamId);
      var requestor = Meteor.users.findOne({_id: userId},{fields: {superUser:1}});
      if(requestor){
        var teamsUsers = Teams.findOne({_id: teamId},{fields:{users:1}})
        var findFilter = {
          _id: {$in: teamsUsers.users},
        }

        if(requestor.superUser !== true){
          findFilter.superUser = false
        }

        return Meteor.users.find(findFilter, {
          fields: {
            firstName: 1,
            lastName: 1,
            username: 1,
            superUser: 1,
            imageUrl: 1,
            username: 1,
            email: 1,
            updatedAt: 1,
            imagedChangedAt: 1,
          }
        }).fetch();
      } else {
        return []
      }
    },

    getTeamResourceInfo(userId, teamId) {
      var ret = {
        meta: {
          start: (new Date()).getTime(),
          end: null,
          processing: null,
        },
        counts: {
          purveyors: null,
          categories: null,
          products: null,
          orders: null,
          cartItems: null,
        },
      }

      ret.counts.products = Products.find({teamId: teamId}).count();
      ret.counts.purveyors = Purveyors.find({teamId: teamId}).count();
      ret.counts.categories = Categories.find({teamId: teamId}).count();
      ret.counts.orders = Orders.find({teamId: teamId}).count();
      ret.counts.cartItems = CartItems.find({teamId: teamId}).count();

      ret.meta.end = (new Date()).getTime()
      ret.meta.processing = ret.meta.end - ret.meta.start;

      return ret;
    },

    deleteTeam: function(teamId, userId) {
      log.debug("DELETE TEAM", teamId);
      Teams.update(teamId, {
        $set: {
          deleted: true,
          updatedAt: (new Date()).toISOString(),
          deletedAt: (new Date()).toISOString(),
          deletedBy: userId,
        }
      });
    },

    getProducts: function(teamId) {
      var queryOptions = {
        sort: { name: 1 },
      };
      var query = {
        teamId: teamId
      };
      log.trace("Retrieving products, with query: ", query, " queryOptions: ", queryOptions);
      return Products.find(query,queryOptions).fetch();
    },

    createProduct: function(productAttributes, productLookup, cb) {
      log.trace("PRODUCT ATTRS", productAttributes);
      var ret = {
        update: null,
      };
      var productLookup = productLookup || { _id: productAttributes._id, teamId: productAttributes.teamId };
      var cb = cb || function(){}
      var productAmount = productAttributes.amount.toString();
      if(productAmount.indexOf('/') !== -1){
        var fractionArray = productAttributes.amount.split('/')
        try {
          productAmount = parseFloat(parseInt(fractionArray[0])/parseInt(fractionArray[1])).toString()
        } catch (e) {
          log.error('UNABLE TO CONVERT FRACTION to DECIMAL: ', productAttributes.amount);
          log.error('ERROR: ', e);
        }
      }
      // upsert the productRow
      var productUpdate = {
        $set: {
          name: productAttributes.name,
          teamId: productAttributes.teamId,
          teamCode: productAttributes.teamCode,
          description: productAttributes.description || '',
          price: productAttributes.price,
          purveyors: productAttributes.purveyors,
          amount: productAmount,
          unit: productAttributes.unit,
          par: productAttributes.par ? productAttributes.par.toString() : '',
          sku: productAttributes.sku ? productAttributes.sku.toString() : '',
          packSize: productAttributes.packSize ? productAttributes.packSize.toString() : '',
          deleted: productAttributes.deleted,
          updatedAt: productAttributes.updatedAt || (new Date()).toISOString()
        },
        $setOnInsert: {
          createdAt: productAttributes.createdAt || (new Date()).toISOString()
        }
      }
      if(productAttributes.hasOwnProperty('_id') === true){
        productUpdate.$setOnInsert._id = productAttributes._id
      }
      log.debug("PRODUCT ATTRS UPDATE - lookup: ", productLookup, " attrs: ", productUpdate);
      ret.update = Products.update(
        productLookup,
        productUpdate,
        { upsert: true },
        Meteor.bindEnvironment(function() {
          var productChanged = Products.findOne(productLookup);
          log.debug('Product Add/Updated: ', productChanged)
          if(cb !== undefined){
            cb(productChanged)
          }
        })
      ); // end Products.update

      return ret;
    },

    updateProduct: function(productId, productAttributes) {
      var realProductId = {_id: productId};
      productAttributes.updatedAt = (new Date()).toISOString();
      var updatedProduct = Products.findOne(realProductId);
      Object.keys(productAttributes).forEach(function(key){
        if(APPROVED_PRODUCT_ATTRS.hasOwnProperty(key) && APPROVED_PRODUCT_ATTRS[key] === true){
          updatedProduct[key] = productAttributes[key];
        }
      })
      if(updatedProduct.hasOwnProperty('deleted') === true && updatedProduct.deleted === true){
        updatedProduct.deletedAt = (new Date()).toISOString()
      }
      log.debug("UPDATE PRODUCT ATTRS ", updatedProduct);
      return Products.update(realProductId, {$set: updatedProduct});
    },

    createCategory: function(categoryAttributes, categoryLookup, cb) {
      log.debug("CATEGORY ATTRS", categoryAttributes);
      var ret = {
        category: null,
        update: null,
        exists: null,
      };
      var categoryLookup = categoryLookup || { name: categoryAttributes.name, teamId: categoryAttributes.teamId};
      var cb = cb || function(){}
      var categoryUpdate = {
        $set: {
          name: categoryAttributes.name,
          teamId: categoryAttributes.teamId,
          teamCode: categoryAttributes.teamCode,
          products: categoryAttributes.products,
          deleted: categoryAttributes.deleted,
          updatedAt: categoryAttributes.updatedAt || (new Date()).toISOString()
        },
        $setOnInsert: {
          createdAt: categoryAttributes.createdAt || (new Date()).toISOString()
        }
      }
      if(categoryAttributes.hasOwnProperty('_id') === true){
        categoryUpdate.$setOnInsert._id = categoryAttributes._id
      }
      ret.update = Categories.update(
        categoryLookup,
        categoryUpdate,
        { upsert: true },
        cb
      );
      ret.category = Categories.findOne(categoryLookup);

      return ret;
    },

    addProductToCategory: function(categoryLookup, productId){
      return Meteor.call('addProductCategory', categoryLookup, productId);
    },

    addProductCategory: function(categoryLookup, productId){
      log.debug("ADD PRODUCT CATEGORY ATTRS", categoryLookup, productId);
      var ret = {
        categoryLookup: categoryLookup,
        update: null,
        exists: null,
        success: null,
        error: null,
      };
      var category = Categories.findOne(categoryLookup);
      if(category === undefined){
        ret.success = false
        ret.error = [{
          message: 'Could not find category using params',
          categoryLookup: categoryLookup
        }]
        log.error('addProductCategory - Could not find category using params', categoryLookup)
      } else {
        if(category.products.indexOf(productId) !== -1){
          ret.exists = true;
        } else {
          var product = Products.findOne({_id: productId});
          if(product !== undefined){
            var categoryUpdate = Categories.update(
              categoryLookup,
              {
                $push : { products: productId },
                $set: {
                  updatedAt: (new Date()).toISOString()
                },
              }
            );
            ret.update = categoryUpdate
            log.debug('addProductCategory - Category update', categoryUpdate)
          } else {
            ret.success = false
            ret.error = [{
              message: 'Could not find product',
              productId: productId
            }]
            log.error('addProductCategory - Could not find product', productId)
          }
        }
        ret.success = true;
      }
      return ret
    },

    updateProductCategory: function(categoryLookup, productId){
      log.debug("UPDATE PRODUCT CATEGORY ATTRS", categoryLookup, productId);
      var ret = {
        categoryLookup: categoryLookup,
        addProductCategory: null,
      };

      var existingCategory = Categories.findOne({products: {$in: [productId]}});
      var categoryProducts = existingCategory.products;
      var productIdx = categoryProducts.indexOf(productId);
      if(productIdx !== -1){
        categoryProducts = existingCategory.products.slice(0, productIdx);
        categoryProducts = categoryProducts.concat(existingCategory.products.slice(productIdx+1));
      }
      Categories.update({_id: existingCategory._id}, {$set:{products: categoryProducts}});

      ret.addProductCategory = Meteor.call('addProductCategory', categoryLookup, productId);

      return ret;

    },

    createPurveyor: function(purveyorAttributes) {
      log.debug("PURVEYOR ATTRS", purveyorAttributes);
      var purveyor = Purveyors.findOne({teamId: purveyorAttributes.teamId, name:purveyorAttributes.name});
      if(purveyor === undefined){
        purveyorAttributes.updatedAt = (new Date()).toISOString();
        var purveyorId = Purveyors.insert(purveyorAttributes);
        var purveyor = Purveyors.findOne({_id: purveyorId});
        log.debug("CREATED PURVEYOR", purveyor);
      } else {
        log.error("Purveyor already exists");
        // TODO: publish an error
      }
    },

    deletePurveyor: function(purveyorId, userId) {
      log.debug("DELETE PURVEYOR ", purveyorId);
      Purveyors.update(purveyorId, {
        $set: {
          deleted: true,
          updatedAt: (new Date()).toISOString(),
          deletedAt: (new Date()).toISOString(),
          deletedBy: userId,
        }
      });
    },

    getOrderDetails: function(orderId) {
      return Orders.findOne({_id: orderId});
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
          var orderId = orderPkg.hasOwnProperty(purveyorId) === true ? orderPkg[purveyorId] : Orders._makeNewID();
          var orderedAt = (new Date()).toISOString();

          var orderDetails = Object.assign({}, order)
          delete orderDetails.id

          Orders.update(
            { _id: orderId },
            {
              $set: {
                userId: userId,
                teamId: teamId,
                teamCode: team.teamCode,
                purveyorId: purveyorId,
                purveyorCode: purveyor.purveyorCode,
                orderDetails: orderDetails,
                orderedAt: orderedAt,
                total: 0.0,
                sent: null,
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

    sendOrderCartItems: function(orderId) {
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
        var Phaxio = Npm.require('phaxio');

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
          orderProductList.push({
            idx: idx,
            name: product.name || 'Product Name Error',
            sku: product.sku || '',
            quantity: cartItem.quantity * product.amount || 'Quantity Error',
            unit: productUnit,
            notes: product.description,
            // notes: cartItem.notes,
          });
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
        globalMergeVars.push({ name: 'CONTACT_MAILER', content: Meteor.settings.MANDRILL.CONTACT_MAILER });
        globalMergeVars.push({ name: 'ORDER_DELIVERY_INSTRUCTIONS', content: (order.deliveryInstruction ? order.deliveryInstruction : false) });
        globalMergeVars.push({ name: 'ORDER_PRODUCTS', content: orderProductList });

        log.info("PROCESSING ORDER: ", orderId);
        log.debug("GLOBAL MERGE VARS: ", JSON.stringify(globalMergeVars));

        if(purveyor.hasOwnProperty('sendFax') === true && purveyor.hasOwnProperty('sendFax') === true){
          var faxText = []
          faxText.push(`Order Submission From: ${team.name}`)
          faxText.push(`Order Date: ${orderDate.format('dddd, MMMM D')}`)
          faxText.push(`Order Time: ${orderDate.format('h:mm A')}`)
          faxText.push('')
          faxText.push(`PLEASE CALL DON AT 530.435.5246 TO CONFIRM RECEIPT`)
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
          faxText.push(`PLEASE CALL DON AT 530.435.5246 TO CONFIRM RECEIPT`)

          var faxOptions = {
            number: purveyor.fax,
            text: faxText.join('\n')
          }
          Meteor.call('faxOrder', faxOptions)
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


        var templateName = Meteor.settings.MANDRILL.TEMPLATES.SEND_ORDER;
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
      }

      return ret;
    },

    sendCart: function(userId, teamId, teamOrderId) {
      var ret = {
        success: false,
        teamOrderId: null,
        orders: null
      }
      // double check if cart has any items
      var realTeamId = {_id: teamId}
      log.debug('SEND CART PARAMS ', userId, teamId, teamOrderId);
      var team = Teams.findOne(realTeamId, {cart: 1});
      log.info('TEAM CART ', team.cart);
      var teamCart = team.cart;

      // if the cart has orders
      if(Object.keys(teamCart.orders).length > 0){
        ret.teamOrderId = teamOrderId
        ret.orders = {}

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
          var purveyor = Purveyors.findOne({_id: purveyorId});

          // Insert order for send
          var orderId = order.id;
          var orderedAt = (new Date()).toISOString();
          var orderDetails = Object.assign({}, order)
          delete orderDetails.id
          Orders.update(
            { _id: orderId },
            {
              $set: {
                userId: userId,
                teamId: teamId,
                teamCode: team.teamCode,
                teamOrderId: teamOrderId,
                orderedAt: orderedAt,
                purveyorId: purveyorId,
                purveyorCode: purveyor.purveyorCode,
                orderDetails: orderDetails,
                confirm: {
                  confirmedAt: null,
                  userId: null,
                  order: false,
                  products: {}
                },
                sent: null,
                error: null,
                mandrillResponse: null,
                updatedAt: (new Date()).toISOString(),
              },
              $setOnInsert: {
                _id: orderId,
                createdAt: teamCart.date,
              }
            },
            { upsert: true }
          );

          // update the team orders
          Teams.update(realTeamId, {
            $push: {
              orders: { id: orderId, sent: false, error: false, orderedAt: orderedAt }
            },
            $set: {
              updatedAt: (new Date()).toISOString(),
            }
          });

          // send the orders
          log.debug('INSERT: ', orderId);
          log.info("EXECUTE sendOrder with: ", orderId);
          ret.orders[orderId] = Meteor.call('sendOrder', orderId);

          // if(orderSent.status === STATUS.ORDER.SENT){
          //   // remove from the cart
          // }

        }.bind(this));

        // TODO: this shouldnt clear the cart if all the orders were not sent successfully
        // TODO: it should only leave unsent orders in the cart (remove the ones that were sent successfully)
        // if(Object.keys(team.orders).length === 0){
          // reset the team cart
          Teams.update(realTeamId, {
            $set: {
              cart: EMPTY_CART,
              updatedAt: (new Date()).toISOString(),
            }
          });
        // }

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

    sendOrder: function(orderId) {
      // notify dj
      // slack.alert({
      //   channel: '@kahdojay',
      //   text: `<@kahdojay> order ${orderId} submitted`,
      //   icon_emoji: ':moneybag:'
      // });
      var ret = {
        success: false
      }
      // real order id
      var realOrderId = {_id: orderId};

      var order = Orders.findOne(realOrderId);
      log.debug('SEND ORDER - REAL ORDER ID: ', realOrderId);
      log.debug('ORDER OBJ: ', JSON.stringify(order));

      // lookup PURVEYOR info
      var purveyor = Purveyors.findOne({ _id: order.purveyorId });

      if(purveyor.hasOwnProperty('sendEmail') === false || purveyor.sendEmail === false){
        log.error('Purveyor sendEmail is disabled or missing, triggering error for user: ', order.userId);
        return Meteor.call('triggerError',
          'send-order-error:send-disabled',
          `Error - ${purveyor.name} email invalid`,
          order.userId
        )
      }

      // lookup BUYER info
      var team = Teams.findOne({ _id: order.teamId });
      var user = Meteor.users.findOne({ _id: order.userId });

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

      // setup the order product list
      var orderProductList = [];

      // add the order products
      var idx = 0
      Object.keys(order.orderDetails.products).forEach(function(productId){
        var product = Products.findOne({ _id: productId });
        var productOrderDetails = order.orderDetails.products[productId];

        // add product to the order products list
        // TODO: validate product fields name/quantity/unit, else triggerError()
        var productUnit = product.unit;
        if(productOrderDetails.quantity > 1){
          if(product.unit == 'bunch'){
            productUnit += 'es';
          } else if(product.unit !== 'ea' && product.unit !== 'dozen' && product.unit !== 'cs'){
            productUnit += 's';
          }
        }
        orderProductList.push({
          idx: idx,
          name: product.name || 'Product Name Error',
          sku: product.sku || '',
          quantity: productOrderDetails.quantity * product.amount || 'Quantity Error',
          unit: productUnit,
          notes: productOrderDetails.notes
        });
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
      globalMergeVars.push({ name: 'CONTACT_MAILER', content: Meteor.settings.MANDRILL.CONTACT_MAILER });
      globalMergeVars.push({ name: 'ORDER_DELIVERY_INSTRUCTIONS', content: (order.deliveryInstruction ? order.deliveryInstruction : false) });
      globalMergeVars.push({ name: 'ORDER_PRODUCTS', content: orderProductList });

      log.info("PROCESSING ORDER: ", orderId);
      log.debug("GLOBAL MERGE VARS: ", JSON.stringify(globalMergeVars));

      if(purveyor.hasOwnProperty('sendFax') === true && purveyor.hasOwnProperty('sendFax') === true){
        var faxText = []
        faxText.push(`Order Submission From: ${team.name}`)
        faxText.push(`Order Date: ${orderDate.format('dddd, MMMM D')}`)
        faxText.push(`Order Time: ${orderDate.format('h:mm A')}`)
        faxText.push('')
        faxText.push(`PLEASE CALL DON AT 530.435.5246 TO CONFIRM RECEIPT`)
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
        faxText.push(`PLEASE CALL DON AT 530.435.5246 TO CONFIRM RECEIPT`)

        var faxOptions = {
          number: purveyor.fax,
          text: faxText.join('\n')
        }
        Meteor.call('faxOrder', faxOptions)
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
        recipients.push({
          email: orderEmail.trim(),
          type: 'to'
        })
      })
      team.orderEmails.split(',').forEach(function(orderEmail) {
        var recipientEmails = recipients.map(function(r) { return r.email })
        if(recipientEmails.indexOf(orderEmail.trim()) === -1){
          log.info('adding orderEmail to recipients CC array: ', orderEmail)
          recipients.push({
            email: orderEmail.trim(),
            type: 'cc'
          })
        }
      })
      log.info('sending email to recipients: ', recipients)
      Mandrill.messages.sendTemplate({
        template_name: Meteor.settings.MANDRILL.TEMPLATES.SEND_ORDER,
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
            error: true,
            mandrillResponse: responseData,
            updatedAt: (new Date()).toISOString(),
          }});
          // update the team orders
          Teams.update({_id: order.teamId, "orders.id": order.id}, {
            $set: {
              orders: { sent: false, error: true },
              updatedAt: (new Date()).toISOString(),
            }
          });
          ret.success = false;
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
          if (Meteor.call('sendSlackNotification', messageAttributes.teamId)) {
            // notify Sous team in Slack
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
                    title: 'Team Code',
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
                  },
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
            error: false,
            mandrillResponse: responseData,
            updatedAt: (new Date()).toISOString(),
          }});
          // update the team orders
          Teams.update({_id: order.teamId, "orders.id": order.id}, {
            $set: {
              orders: { sent: true, error: false },
              updatedAt: (new Date()).toISOString(),
            }
          });
          ret.success = true;
          log.debug("ORDER SENT...", orderId)
        }
      }.bind(this));

      return ret;
    },

    updateOrder: function(userId, orderId, orderAttributes) {
      log.debug("UPDATE ORDER ATTRS", JSON.stringify(orderAttributes));
      var realOrderId = {_id: orderId};
      orderAttributes.updatedAt = (new Date()).toISOString();
      return Orders.update(realOrderId, {$set: orderAttributes});
    },

    // =====Push Notifications=====
    registerInstallation: function(userId, deviceAttributes) {
      log.trace('registerInstallation userId: ', userId)
      log.trace('registerInstallation deviceAttributes: ', deviceAttributes)

      var tokenValid = false
      if(deviceAttributes.token.indexOf('Error') === -1){
        tokenValid = true
      }
      tokenValid = true
      if(deviceAttributes.hasOwnProperty('token') === true){
        if(tokenValid === true){
          var user = Meteor.users.findOne({_id: userId});
          // get the user's teamCodes
          var userTeamCodes = Teams.find(
            {
              users: { $in: [userId] },
              notepad: { $exists: false }
            },
            { fields: { teamCode: 1 } }
            ).fetch()
            .map(function(team) { return `${Meteor.settings.APP.ENV[0]}-${team.teamCode}` })

          log.trace('registering installation for team channels (ids): ', userTeamCodes)

          var installationId = aguid(`${deviceAttributes.model}-${slug(deviceAttributes.deviceName, { replacement: '' })}-${userId}`,)

          var data = {
            "installationId": installationId,
            "appVersion": deviceAttributes.appVersion,
            "appBuildNumber": deviceAttributes.appBuildNumber,
            "deviceType": "ios",
            "deviceToken": deviceAttributes.token,
            "deviceModel": deviceAttributes.model,
            "deviceName": deviceAttributes.deviceName,
            "deviceSystemName": deviceAttributes.systemName,
            "deviceSystemVersion": deviceAttributes.systemVersion,
            "channels": userTeamCodes,
            "phoneNumber": user.username,
            "userId": userId,
            "badge": 0
          }

          var update = Meteor.call('updateInstallation', userId, data);

          // if nothing to update, then register a new instance
          if(update.success !== true){
            // register installation to channels via the user's teamCodes
            Meteor.http.post(PARSE.INSTALLATION_URL, {
              headers: PARSE.HEADERS,
              "data": data
            }, Meteor.bindEnvironment(function(err, res){
              if(err){
                log.error('registerInstallation error: ', err);
              }
              log.trace('registerInstallation response: ', res);
              if(!err && res.data.hasOwnProperty('error') === false){
                data.parseId = res.data.objectId;
                data.updatedAt = (new Date()).toISOString();
                Settings.update({userId: userId}, {$set:data})
              }
            }))
          }

        } else {
          log.error('Registration failed due to invalid token');
        }
      } else {
        // TODO: Send error?
      }

    },

    updateInstallation: function(userId, dataAttributes){
      log.debug('updateInstallation userId: ', userId)
      log.debug('updateInstallation dataAttributes: ', dataAttributes)
      var ret = {
        success: null,
        error: null,
        userId: userId,
        dataAttributes: dataAttributes
      }
      var userSettings = Settings.findOne({userId: userId})
      if(userSettings === undefined){
        ret.success = false;
        ret.error = [{
          message: 'Could not find settings for user'
        }]
      } else {
        if(userSettings.hasOwnProperty('parseId') === true && userSettings.parseId){
          var processUpdate = false;
          var updateDataAttributes = {};
          Object.keys(dataAttributes).forEach(function(key){
            if(APPROVED_PARSE_UPDATE_ATTRS[key] === 1){
              updateDataAttributes[key] = dataAttributes[key]
              processUpdate = true;
            }
          })
          if(processUpdate){
            var updateUrl = `${PARSE.INSTALLATION_URL}/${userSettings.parseId}`
            log.trace('updateInstallation url: ', updateUrl)
            log.trace('updateInstallation updateDataAttributes: ', updateDataAttributes)
            Meteor.http.put(updateUrl, {
              headers: PARSE.HEADERS,
              // body: JSON.stringify(data)
              "data": updateDataAttributes
            }, Meteor.bindEnvironment(function(err, res){
              if(err){
                log.error('updateInstallation error: ', err);
              }
              log.trace('updateInstallation response: ', res);
              if(!err && res.data.hasOwnProperty('error') === false){
                dataAttributes.updatedAt = (new Date()).toISOString();
                Settings.update({userId: userId}, {$set:dataAttributes})
              }
            }))
          }
          ret.success = true;
        } else {
          ret.success = false;
          ret.error = [{
            message: 'Could not find parse setting for user',
            parseId: userSettings.parseId || null
          }]
        }
      }
      if(ret.success === true){
        log.trace('updateInstallation return success: ', ret);
      } else {
        log.error('updateInstallation return failure: ', ret);
      }
      return ret;
    },

    triggerPushNotification: function(message, teamId, userId) {
      if (!message || !teamId) {
        return {
          success: false,
          // errorId: errorId,
          // machineKey: machineKey,
          // userId: userId,
        }
      }
      log.trace('triggerPushNotification: ', message, ' to team: ', teamId, ' by user: ', userId)
      var user = Meteor.users.findOne({_id: userId});
      var messageTeam = Teams.findOne({ _id: teamId }, { fields: { teamCode: 1 } })
      var channel = `${Meteor.settings.APP.ENV[0]}-${messageTeam.teamCode}` || `T-${Meteor.settings.APP.ENV[0]}-${messageTeam._id}`
      Meteor.http.post(PARSE.PUSH_URL, {
        method: 'PUSH',
        headers: PARSE.HEADERS,
        "data": {
          "where": {
            "channels": channel,
            "$ne": {
              "phoneNumber": user.username
            }
          },
          "data": {
            "alert": message,
            "badge": "Increment"
          }
        }
      })
      Meteor.call('updateInstallation', userId, {"badge": 0});
    },

    sendEmail: function(requestAttributes) {
      var emailOptions = {
        from_email: 'sous@sousapp.com',
        from_name: 'Sous',
        to: [{
          email: 'sous@sousapp.com',
          name: 'Sous',
          type: 'to'
        }],
        subject: 'No subject'
      }

      switch(requestAttributes.type) {
        case 'REQUEST_ORDER_GUIDE':
          emailOptions.from_email = requestAttributes.fromEmail;
          emailOptions.from_name = requestAttributes.fromName;
          emailOptions.to = [{
            email: 'orders@sousapp.com',
            name: 'Orders',
            type: 'to'
          }];
          emailOptions.subject = 'Order Guide Request';
          emailOptions.text = requestAttributes.body;
          break;

        case 'UPLOAD_ORDER_GUIDE':
          emailOptions.from_email = requestAttributes.fromEmail;
          emailOptions.from_name = requestAttributes.fromName;
          emailOptions.to = [{
            email: 'orders@sousapp.com',
            name: 'Orders',
            type: 'to'
          }];
          emailOptions.subject = requestAttributes.subject;
          emailOptions.text = requestAttributes.body;
          emailOptions.attachments = requestAttributes.attachments;
          break;

        case 'UPLOAD_ORDER_INVOICE':
          emailOptions.from_email = requestAttributes.fromEmail;
          emailOptions.from_name = requestAttributes.fromName;
          emailOptions.to = [{
            email: 'invoices@sousapp.com',
            name: 'Invoices',
            type: 'to'
          }];
          emailOptions.subject = requestAttributes.subject;
          emailOptions.text = requestAttributes.body;
          // emailOptions.attachments = requestAttributes.attachments;
          break;

        default:
          emailOptions.text = JSON.stringify(requestAttributes);
          break;

      }

      // send bcc copy to dev
      emailOptions.to.push({
        email: 'ilya@sousapp.com',
        name: 'Ilya Shindyapin',
        type: 'bcc'
      })

      var debugEmailOptions = Object.assign({}, emailOptions);
      if(debugEmailOptions.hasOwnProperty('attachments') === true){
        debugEmailOptions.attachmentsCount = debugEmailOptions.attachments.length;
        delete debugEmailOptions.attachments;
      }
      log.debug('Sending email with options - type:', requestAttributes.type, ' email options:', debugEmailOptions);

      Mandrill.messages.send({
        message: emailOptions,
        async: false,
      }, function(result){
        log.debug('Email send result: ', result)
        return {
          success: true
        }
      }, function(e) {
        log.error('A mandrill error occurred: ' + e.name + ' - ' + e.message);
        return {
          success: false
        }
      })
    }

    // ... end of function
  })
}
