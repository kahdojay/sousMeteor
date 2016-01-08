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
    CART_ITEM: { NEW: 'NEW', ORDERED: 'ORDERED', RECEIVED: 'RECEIVED' },
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

  var APPROVED_PARSE_ATTRS = {
    "deviceType": 1,
    "deviceToken": 1,
    "installationId": 1,
    "channels": 1,
    "phoneNumber": 1,
    "userId": 1,
    "badge": 1,
  };

  var PARSE = {
    INSTALLATION_URL: 'https://api.parse.com/1/installations',
    PUSH_URL: 'https://api.parse.com/1/push',
    HEADERS: {
      "Accept": "application/json",
      "X-Parse-Application-Id": Meteor.settings.PARSE.APPLICATION_ID,
      "X-Parse-REST-API-Key": Meteor.settings.PARSE.REST_API_KEY,
      "Content-Type": "application/json",
    }
  }

  var Putter =  Meteor.npmRequire('base64-string-s3');

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
    Settings._ensureIndex(
      {userId: 1}
    );
    CartItems._ensureIndex(
      { teamId: 1 }
    );
    CartItems._ensureIndex(
      { orderId: 1 }
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
      log.debug('progress', data);
      // progress { percent: 20, written: 768, total: 3728 }
    });
    putter.on('response', function (data) {
      log.debug('response', data);
      // response { path: 'https://<bucket>.s3.amazonaws.com/images/success.jpg' }
    });
    putter.on('error', function (err) {
      log.error('putter error', err);
    });
    putter.on('close', function () {
      log.debug('closed connection');
    });
  });

  Meteor.methods({
    getBuildInfo: function(){
      return {
        version: pkgInfo.version,
        build: pkgInfo.build,
      };
    },

    renamePurveyor: function(purveyorCode, newPurveyorName) {
      let purveyor = Purveyors.findOne({purveyorCode: purveyorCode})
      Purveyors.update(
        {_id: purveyor._id},
        { $set:
          { name: newPurveyorName, company: newPurveyorName }
        }
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
            updatedAt: (new Date()).toISOString(),
          }})
        })
      );
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
      var categories = Categories.find({},{fields:{name:1, products:1}}).fetch();
      categories.forEach(function(category){
        var filteredCategoryProducts = flattenUniqueArray(category.products);
        var categoryProducts = [];
        filteredCategoryProducts.forEach(function(productId){
          var product = Products.findOne({_id: productId});
          if(product !== undefined){
            categoryProducts.push(productId);
          } else {
            log.debug('Category: ' + category.name + ' for ' + category.teamCode + ' has products that do not exist.')
          }
        })
        var updated = Categories.update({_id:category._id},{
          $set:{
            products: categoryProducts,
            updatedAt: (new Date()).toISOString()
          }
        });
        log.debug('Fixed category: ' + category.name, updated);
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
          { $set : { purveyors: purveyorsArray } }
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

    // resetImportInvite: function(phoneNumbers) {
    //   var status = {
    //     remove: {},
    //     import: {},
    //     invite: [],
    //     errors: {}
    //   };
    //   if(!phoneNumbers || phoneNumbers.length < 1){
    //     status.errors.phoneNumber = 'Missing phone number(s) for invitation(s)';
    //     return status;
    //   }
    //
    //   status.remove.teams = Teams.remove({});
    //   status.remove.users = Meteor.users.remove({});
    //   status.remove.purveyors = Purveyors.remove({});
    //   status.remove.errors = Errors.remove({});
    //   status.remove.messages = Messages.remove({});
    //   status.remove.recipes = Recipes.remove({});
    //   status.remove.orders = Orders.remove({});
    //   status.remove.products = Products.remove({});
    //   status.remove.categories = Categories.remove({});
    //   status.import.teams = Meteor.call('importTeams', "https://sheetsu.com/apis/816ed77a");
    //   status.import.users = Meteor.call('importUsers', "https://sheetsu.com/apis/452f3fd5");
    //
    //   var firstTeam = Teams.findOne({}, {sort: {createdAt: 1}});
    //   var teamId = firstTeam._id;
    //   var invitorUserId = firstTeam.users[0];
    //
    //   status.import.purveyors = Meteor.call('importPurveyors', "https://sheetsu.com/apis/06d066f5");
    //   status.import.products_all = Meteor.call('importProducts', "https://sheetsu.com/apis/d1d0cbb3");
    //   // status.import.products_demo = Meteor.call('importProducts', "https://sheetsu.com/apis/fe64e183");
    //   status.import.messages = Meteor.call('importMessages', 'https://sheetsu.com/apis/fdb1cf6b');
    //   status.import.teamTasks = Meteor.call('importTeamTasks', 'https://sheetsu.com/apis/15a051ab');
    //
    //   phoneNumbers.forEach(function(phoneNumber) {
    //     status.invite.push(Meteor.call('sendSMSInvite', phoneNumber, teamId, invitorUserId))
    //   })
    //
    //   return status;
    // },

    resetDemoData: function() {
      var status = {
        demoTeam: null,
        remove: {},
        import: {},
      };
      status.demoTeam = Teams.findOne({teamCode: Meteor.settings.APP.DEMO_TEAMCODE});

      status.import.purveyors = Purveyors.remove({teamCode: Meteor.settings.APP.DEMO_TEAMCODE});
      // Products.remove({teamCode: Meteor.settings.APP.DEMO_TEAMCODE});
      // Categories.remove({teamCode: Meteor.settings.APP.DEMO_TEAMCODE});
      Orders.remove({teamId: status.demoTeam._id});
      Messages.remove({teamId: status.demoTeam._id});
      Teams.update({_id: status.demoTeam._id}, {$set:{
        tasks:[],
        deleted: false
      }})

      status.import.messages = Meteor.call('importMessages', 'https://sheetsu.com/apis/fdb1cf6b', Meteor.settings.APP.DEMO_TEAMCODE);
      status.import.teamTasks = Meteor.call('importTeamTasks', 'https://sheetsu.com/apis/15a051ab', Meteor.settings.APP.DEMO_TEAMCODE);
      status.import.purveyors = Meteor.call('importPurveyors', "https://sheetsu.com/apis/06d066f5", Meteor.settings.APP.DEMO_TEAMCODE);
      status.import.products = Meteor.call('importProducts', "https://sheetsu.com/apis/d1d0cbb3", Meteor.settings.APP.DEMO_TEAMCODE);

      return status;
    },

    importMessages: function(url, teamCode) {
      if(undefined === teamCode){
        teamCode = 'all';
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

        if(teamCode !== undefined && teamCode !== 'all'){
          if(message.teamCode !== teamCode){
            log.debug('Skipping teamCode: ' + message.teamCode);
            return false;
          }
        }

        var messageAttributes = {
          createdAt: (new Date()).toISOString(),
        };

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
          var team = Teams.findOne({teamCode: message.teamCode},{fields:{teamCode:1, users:1}});
          messageAttributes.teamId = team._id;
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

        if(message.hasOwnProperty('teamCode') && message.teamCode !== ''){
          var team = Teams.findOne({teamCode: message.teamCode},{fields:{teamCode:1}});
          messageAttributes.teamId = team._id;
        }

        if(message.hasOwnProperty('_id') && message._id !== ''){
          messageAttributes._id = message._id;
        }

        // log.debug(messageAttributes)

        ret.messages[message._id] = Meteor.call('createMessage', messageAttributes, false);
      })

      return ret;
    },

    importTeams: function(url) {
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

    importPurveyors: function(url, teamCode) {
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

      // upsert the purveyor
      Purveyors.update(
        purveyorLookup,
        {
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
            sendEmail: (purveyor.sendEmail === "TRUE" ? true: false),
            deleted: false,
            updatedAt: (new Date()).toISOString()
          },
          $setOnInsert: {
            createdAt: (new Date()).toISOString()
          }
        },
        { upsert: true },
        Meteor.bindEnvironment(function() {
          log.info('Successfully imported: ' + purveyor.name)
        })
      )
      return true;
    },

    importProducts: function(url, teamCode) {
      if(undefined === teamCode){
        teamCode = 'all';
      }
      var ret = {
        teamCode: teamCode,
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
      response.data.result.forEach(function(productRow) {
        if(productRow.hasOwnProperty('process') === true && productRow.process === 'FALSE'){
          ret.products.errorProcess += 1;
          return false;
        }
        if(productRow.hasOwnProperty('teamCode') === false){
          ret.products.errorTeamCode += 1;
          return false;
        }

        if(teamCode !== undefined && teamCode !== 'all'){
          if(productRow.teamCode !== teamCode){
            log.debug('Skipping teamCode: ' + productRow.teamCode);
            return false;
          }
        }

        var teamId = Teams.findOne({teamCode: productRow.teamCode},{fields:{_id:1}});
        if(teamId === undefined){
          return false
        } else {
          teamId = teamId._id;
        }

        var purveyorCodes = productRow.purveyors.split(',');
        var purveyors = []
        purveyorCodes.forEach(function(purveyorCode) {
          purveyor = Purveyors.findOne({ purveyorCode: purveyorCode });
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
            Products.update({ _id: productRow._id }, {$set: {deleted: true}});
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
          }
        } else {

          var productLookup = { name: productRow.name, teamId: teamId };
          if(productRow.hasOwnProperty('_id') === true && productRow._id !== '#N/A' && productRow._id !== ''){
            productLookup = { _id: productRow._id, teamId: teamId };
          }

          log.debug('Product lookup: ', productLookup);

          var newProductAttributes = {
            _id: productRow._id,
            name: productRow.name,
            teamId: teamId,
            teamCode: productRow.teamCode,
            description: productRow.description,
            price: productRow.price,
            purveyors: purveyors,
            amount: productRow.amount,
            unit: productRow.unit,
            par: productRow.par,
            deleted: false,
            createdAt: (new Date()).toISOString(),
            updatedAt: (new Date()).toISOString()
          };
          var productResult = Meteor.call('createProduct', newProductAttributes, productLookup);
          log.debug('productResult: ', productResult)

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

            var addProductToCategoryResult = Meteor.call('addProductToCategory', categoryLookup, newProductAttributes._id);

          } // end if productRow.category is not blank

        }
        ret.products.success += 1;
      }); // end response.data.result.forEach

      ret.after = Products.find().count();
      ret.removedCategories = Categories.remove({products: {$size: 0}});
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
          price: product.price
        };
        log.debug("PRODUCT EXPORT: ", exportProductAttributes)
        Export.insert(exportProductAttributes);
        ret.import += 1;
      })

      return ret;
    },

    importTeamTasks: function(url, teamCode) {
      if(undefined === teamCode){
        teamCode = 'all';
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

        if(teamCode !== undefined && teamCode !== 'all'){
          if(task.teamCode !== teamCode){
            log.debug('Skipping teamCode: ' + task.teamCode);
            return false;
          }
        }

        var teamId = null;
        var userId = null;
        if(task.hasOwnProperty('teamCode') && task.teamCode !== ''){
          var team = Teams.findOne({teamCode: task.teamCode},{fields:{teamCode:1,users:1}});
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
          unit: parseInt(task.unit),
        }

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

    getUserByPhoneNumber: function(phoneNumber) {
      var ret = {
        success: false,
        userId: null,
        user: null,
        notepadExists: false,
        status: null, // STATUS.USER
      }
      //phoneNumber = sanitizeString(phoneNumber);
      phoneNumber = phoneNumber.toString().replace(/\D/g, '');
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
        var idx = team.users.indexOf(userPkg.userId);
        if(idx !== -1){
          var teamUsers = team.users.slice(0, idx);
          teamUsers = teamUsers.concat(team.users.slice(idx+1));
          var update = Teams.update({teamCode: teamCode}, {$set:{users: teamUsers}});
          log.debug('UPDATE team: ', teamCode, update, ' with: ', teamUsers);
        }
      })
    },

    addUserToTeamByTeamCodes: function(phoneNumber, teamCodes) {
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
      var userPkg = Meteor.call('getUserByPhoneNumber', phoneNumber);
      var user = userPkg.user;

      var sendSmsToken = true;
      if(null !== authToken && authToken === user.authToken){
        sendSmsToken = false;
        Meteor.users.update({_id: user._id}, {$set: {
          // smsSent: false,
          smsVerified: true,
          smsTokenCount: 0,
          updatedAt: (new Date()).toISOString(),
        }});
      } else {
        Meteor.users.update({_id: user._id}, {$set: {
          authToken: null,
          // smsSent: false,
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
          body: smsToken + ' is your Sous verification code.'
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
        // } else {
        //   Meteor.call('triggerError',
        //     'token-limit',
        //     'You have reached token limit, please contact us.',
        //     user._id
        //   )
        // }
      }
      return {}
    },

    loginWithSMS: function(phoneNumber, token){
      log.info('LOGIN WITH SMS: ', phoneNumber, token)

      // Get the user by their phone number
      var userPkg = Meteor.call('getUserByPhoneNumber', phoneNumber);
      var user = userPkg.user;

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
    },

    updateUser: function(userId, userAttributes) {
      //TODO: prevent updates of critical attributes, smsToken, authToken, etc..
      log.debug("UPDATE USER ATTRS", userId, JSON.stringify(userAttributes));
      userAttributes.updatedAt = (new Date()).toISOString();
      var update = Meteor.users.update({_id: userId}, {$set:userAttributes})
      log.debug('UPDATE: ', update, ' with: ', userAttributes)
      return {
        user: Meteor.users.findOne({_id: userId}),
        update: update
      };
    },

    triggerError: function(machineKey, msg, userId) {
      log.error('TRIGGER NEW ERROR: ', machineKey, msg, ' USERID: ', userId);
      var errorId = Errors.insert({
        userId: userId,
        machineKey: machineKey,
        message: msg,
        createdAt: new Date(),
      });

      // alert the Sous team in Slack (only for the short term)
      var user = Meteor.users.findOne({ _id: userId });
      slack.alert({
        username: 'errorBot',
        channel: '#dev-errors',
        text: `Client Error triggered by (firstName: ${user.firstName}) (username: ${user.username}) (email: ${user.email}): ${msg}`
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

      if(dontTriggerPushNotification === true){
        Meteor.call('triggerPushNotification', message, messageAttributes.teamId, messageAttributes.userId)
      }
      return {
        success: true,
        messageId: messageId
      }
    },

    getTeamMessages: function(teamId, messageDate, sinceDate){
      var createdAtLogic = { $lte: messageDate };
      var queryOptions = {
        sort: {createdAt: -1},
        limit: 20
      };
      var query = {
        teamId: teamId,
        createdAt: createdAtLogic
      };
      if(sinceDate !== undefined && sinceDate === true){
        createdAtLogic = { $gte: messageDate };
        queryOptions = {
          sort: {createdAt: -1}
        };
      }
      log.debug("Retrieving messages, with query: ", query, " queryOptions: ", queryOptions);
      return Messages.find(query,queryOptions).fetch();
    },

    createTeam: function(teamAttributes) {
      log.debug("TEAM ATTRS", teamAttributes);
      var team = Teams.findOne({_id: teamAttributes._id, name: teamAttributes.name});
      if(team === undefined){
        if(teamAttributes.hasOwnProperty('createdAt') === false){
          teamAttributes.createdAt = (new Date()).toISOString();
        }
        // TODO: remove this after all data transition to CartItems
        teamAttributes.cart = EMPTY_CART;
        teamAttributes.updatedAt = (new Date()).toISOString();
        var teamId = Teams.insert(teamAttributes);
        var messageAttributes = {
            type: 'welcome',
            author: 'Sous',
            teamId: teamId,
            createdAt: (new Date()).toISOString(),
            imageUrl: 'https://sous-assets-production.s3.amazonaws.com/uploads/89b217dc-4ec5-43e8-9569-8fc85e6fdd52/New+Sous+Logo+Circle+Small.png',
            text: 'Welcome to Sous!'
          }
        // TODO: Refactor to use common message library
        Messages.insert(messageAttributes)


        var team = Teams.findOne({_id: teamId});
        log.debug("CREATED TEAM", team);
      } else {
        log.error("Team already exists");
        // TODO: publish an error
      }
    },

    updateTeam: function(teamId, teamAttributes) {
      log.debug("UPDATE TEAM ATTRS", JSON.stringify(teamAttributes));
      var realTeamId = {_id: teamId};
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
            updatedAt: (new Date()).toISOString()
          }
        });
      }
      team = Teams.findOne({_id: teamId});
      log.debug("UPDATED TEAM", team);
    },

    addCartItem: function(userId, teamId, cartItemAttributes) {
      log.debug("ADD CART ITEM ATTRS - userId: ", userId, ' teamId: ', teamId, ' cart attrs: ',cartItemAttributes);
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
        cartItemUpsert.purveyorId = cartItemAttributes.purveyorId;
        cartItemUpsert.productId = cartItemAttributes.productId;
        cartItemUpsert.productName = product.name;
        cartItemUpsert.status = STATUS.CART_ITEM.NEW;
        cartItemUpsert.orderId = null;
        cartItemUpsert.quantity = cartItemAttributes.quantity;
        cartItemUpsert.note = cartItemAttributes.note;
        cartItemUpsert.createdAt = (new Date()).toISOString();
        if(cartItemAttributes.hasOwnProperty('_id') === true){
          cartItemUpsert._id = cartItemAttributes._id;
        }
      } else {
        // update attributes
        cartItemUpsert.quantity = cartItemAttributes.quantity;
        cartItemUpsert.note = cartItemAttributes.note;
        cartItemUpsert.updatedAt = (new Date()).toISOString();
      }

      ret.upsert = CartItems.update(cartItemLookup, cartItemUpsert, {upsert: true});
      ret.success = true;

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

      var cartItemUpdate = {
        updatedAt: (new Date()).toISOString(),
      };

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
      ret.delete = CartItems.remove(cartItemLookup);
      ret.success = true;

      return ret;
    },

    getTeamCartItems: function(teamId) {
      const query = {
        teamId: teamId
      }
      const queryOptions = {}
      log.debug("Retrieving cart items, with query: ", query, " queryOptions: ", queryOptions);
      return CartItems.find(query, queryOptions).fetch();
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

    createProduct: function(productAttributes, productLookup, cb) {
      log.debug("PRODUCT ATTRS", productAttributes);
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
          par: productAttributes.par.toString(),
          sku: productAttributes.sku || '',
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
      log.debug("UPDATE PRODUCT ATTRS", JSON.stringify(updatedProduct));
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
      log.debug("ADD PRODUCT CATEGORY ATTRS", categoryLookup, productId);
      var ret = {
        categoryLookup: categoryLookup,
        update: null,
        exists: null,
        success: null,
        erorr: null,
      };
      var category = Categories.findOne(categoryLookup);
      if(category === undefined){
        ret.success = false
        ret.error = [{
          message: 'Could not find category using params',
          categoryLookup: categoryLookup
        }]
      } else {
        if(category.products.indexOf(productId) !== -1){
          ret.exists = true;
        } else {
          var product = Products.findOne({_id: productId});
          if(product !== undefined){
            ret.update = Categories.update(
              categoryLookup,
              {
                $push : { products: productId },
                $set: {
                  updatedAt: (new Date()).toISOString()
                },
              }
            );
          } else {
            ret.success = false
            ret.error = [{
              message: 'Could not find product',
              productId: productId
            }]
          }
        }
        ret.success = true;
      }
      return ret
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

    sendCart: function(userId, teamId) {
      var ret = {
        success: false,
        orders: null
      }
      var team = Teams.findOne({_id: teamId}, {fields: {teamCode: 1}});
      // double check if cart has any items
      log.debug('SEND CART PARAMS ', userId, teamId, team.teamCode);
      var pipeline = [
        { $match: {
            teamId: teamId,
            status: STATUS.CART_ITEM.NEW
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
          var orderId = Orders._makeNewID();
          var orderedAt = (new Date()).toISOString();
          Orders.update(
            { _id: orderId },
            {
              $set: {
                userId: userId,
                teamId: teamId,
                teamCode: team.teamCode,
                purveyorId: purveyorId,
                purveyorCode: purveyor.purveyorCode,
                orderedAt: orderedAt,
                total: 0.0,
                sent: null,
                confirm: {
                  confirmedAt: null,
                  userId: null,
                  order: false,
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
              status: STATUS.CART_ITEM.ORDERED
            }
          },{ multi:true })

          // send the orders
          log.debug('INSERT: ', orderId);
          log.info("EXECUTE sendOrder with: ", orderId);
          ret.orders[orderId] = Meteor.call('sendOrder', orderId);

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

    sendOrder: function(orderId) {
      var ret = {
        success: false
      }
      // real order id
      var realOrderId = {_id: orderId};
      var order = Orders.findOne(realOrderId);
      log.debug('SEND ORDER - REAL ORDER ID: ', realOrderId);
      log.debug('ORDER OBJ: ', JSON.stringify(order));

      // lookup BUYER info
      var team = Teams.findOne({ _id: order.teamId });
      var user = Meteor.users.findOne({ _id: order.userId });

      // notify dj
      slack.alert({
        channel: '@kahdojay',
        text: `<@kahdojay> order ${orderId} submitted for ${team.teamCode} by ${user.firstName} ${user.lastName} in ${Meteor.settings.APP.ENV}`,
        icon_emoji: ':moneybag:'
      });

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
          notes: product.description
          // notes: cartItem.notes
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
        recipients.push({
          email: orderEmail.trim(),
          type: 'to'
        })
      })
      team.orderEmails.split(',').forEach(function(orderEmail) {
        log.info('adding orderEmail to recipients CC array: ', orderEmail)
        recipients.push({
          email: orderEmail.trim(),
          type: 'cc'
        })
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
            channel: '#orders',
            text: '<!channel> Mandrill Order Error!',
            attachments: slackAttachments
          });
          Meteor.call('triggerError',
            'technical-error:email',
            'Order Send Error - Sous has been notified, please send this order to your purveyors directly.',
            order.userId
          )

          var purveyorName = Purveyors.findOne({_id: order.purveyorId}).name
          var messageAttributes = {
              message: `Order Error: ${purveyorName}`,
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
              purveyor: Purveyors.findOne({_id: order.purveyorId}).name,
              type: 'order',
              author: 'Sous',
              teamId: order.teamId,
              createdAt: (new Date()).toISOString(),
              imageUrl: 'https://sous-assets-production.s3.amazonaws.com/uploads/89b217dc-4ec5-43e8-9569-8fc85e6fdd52/New+Sous+Logo+Circle+Small.png',
              userId: user._id,
            }
          // TODO: Refactor to use common message library
          Messages.insert(messageAttributes);
          var message = `Order sent to ${messageAttributes.purveyor}`
          Meteor.call('triggerPushNotification', message, messageAttributes.teamId, messageAttributes.userId)
          // notify Sous team in Slack
          const slackAttachments = [
            {
              title: 'Order Details',
              color: 'good',
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
      log.debug('registerInstallation userId: ', userId)
      log.debug('registerInstallation deviceAttributes: ', deviceAttributes)

      if(deviceAttributes.hasOwnProperty('token') === true){
        if(deviceAttributes.token.indexOf('Error') === -1){
          var user = Meteor.users.findOne({_id: userId});
          // get the user's teamCodes
          var userTeamCodes = Teams.find(
            {
              users: { $in: [userId] },
              notepad: { $exists: false }
            },
            { fields: { teamCode: 1 } }
            ).fetch()
            .map(function(team) { return `${team.teamCode}-${Meteor.settings.APP.ENV}` })

          log.debug('registering installation for team channels (ids): ', userTeamCodes)

          var data = {
            "deviceType": "ios",
            "deviceToken": deviceAttributes.token,
            "channels": userTeamCodes,
            "phoneNumber": user.username,
            "userId": userId,
            "badge": 0
          }

          if(deviceAttributes.hasOwnProperty('uuid') === true){
            data.installationId = deviceAttributes.uuid;
          }

          var update = Meteor.call('updateInstallation', userId, data);

          // if nothing to update, then register a new instance
          if(update.success !== true){
            // register installation to channels via the user's teamCodes
            Meteor.http.post(PARSE.INSTALLATION_URL, {
              headers: PARSE.HEADERS,
              // body: JSON.stringify(data)
              "data": data
            }, Meteor.bindEnvironment(function(err, res){
              log.debug('registerInstallation error: ', err);
              log.debug('registerInstallation response: ', res);
              if(!err && res.data.hasOwnProperty('error') === false){
                data.parseId = res.data.objectId;
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
            if(APPROVED_PARSE_ATTRS[key] === 1){
              updateDataAttributes[key] = dataAttributes[key]
              processUpdate = true;
            }
          })
          if(processUpdate){
            var updateUrl = `${PARSE.INSTALLATION_URL}/${userSettings.parseId}`
            log.debug('updateInstallation url: ', updateUrl)
            Meteor.http.put(updateUrl, {
              headers: PARSE.HEADERS,
              // body: JSON.stringify(data)
              "data": updateDataAttributes
            }, Meteor.bindEnvironment(function(err, res){
              log.debug('updateInstallation error: ', err);
              log.debug('updateInstallation response: ', res);
              if(!err && res.data.hasOwnProperty('error') === false){
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
        log.debug('updateInstallation return success: ', ret);
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
      log.debug('triggerPushNotification: ', message, ' to team: ', teamId, ' by user: ', userId)
      var user = Meteor.users.findOne({_id: userId});
      var messageTeam = Teams.findOne({ _id: teamId }, { fields: { teamCode: 1 } })
      var channel = `${messageTeam.teamCode}-${Meteor.settings.APP.ENV}` || `T-${messageTeam._id}-${Meteor.settings.APP.ENV}`
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
