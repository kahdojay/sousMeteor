Errors = new Mongo.Collection('errors');
Messages = new Mongo.Collection('messages');
Recipes = new Mongo.Collection('recipes');
Orders = new Mongo.Collection('orders');
Purveyors = new Mongo.Collection('purveyors');
Products = new Mongo.Collection('products');
Categories = new Mongo.Collection('categories');
Teams = new Mongo.Collection('teams');

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
    NOTEPAD: { NEW: 'NEW', EXISTING: 'EXISTING' }
  };

  var EMPTY_CART = {
    date: null,
    total: 0.0,
    orders: {}
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
      { "createdAt": 1 },
      { expireAfterSeconds: 5 }
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
      console.log('progress', data);
      // progress { percent: 20, written: 768, total: 3728 }
    });
    putter.on('response', function (data) {
      console.log('response', data);
      // response { path: 'https://<bucket>.s3.amazonaws.com/images/success.jpg' }
    });
    putter.on('error', function (err) {
      console.error('putter error', err);
    });
    putter.on('close', function () {
      console.log('closed connection');
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
          }})
        })
      );
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
          }
        })
        var updated = Categories.update({_id:category._id},{
          $set:{
            products: categoryProducts,
            updatedAt: (new Date()).toISOString()
          }
        });
        console.log('Fixed category: ' + category.name, updated);
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
        console.log('Fixed team: ' + team.name, updated);
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

    resetImportInvite: function(phoneNumbers) {
      var status = {
        remove: {},
        import: {},
        invite: [],
        errors: {}
      };
      if(!phoneNumbers || phoneNumbers.length < 1){
        status.errors.phoneNumber = 'Missing phone number(s) for invitation(s)';
        return status;
      }

      status.remove.teams = Teams.remove({});
      status.remove.users = Meteor.users.remove({});
      status.remove.purveyors = Purveyors.remove({});
      status.remove.errors = Errors.remove({});
      status.remove.messages = Messages.remove({});
      status.remove.recipes = Recipes.remove({});
      status.remove.orders = Orders.remove({});
      status.remove.products = Products.remove({});
      status.remove.categories = Categories.remove({});
      status.import.teams = Meteor.call('importTeams', "https://sheetsu.com/apis/816ed77a");
      status.import.users = Meteor.call('importUsers', "https://sheetsu.com/apis/452f3fd5");

      var firstTeam = Teams.findOne({}, {sort: {createdAt: 1}});
      var teamId = firstTeam._id;
      var invitorUserId = firstTeam.users[0];

      status.import.purveyors = Meteor.call('importPurveyors', "https://sheetsu.com/apis/06d066f5");
      status.import.products_tosca = Meteor.call('importProducts', "https://sheetsu.com/apis/d1d0cbb3");
      status.import.products_demo = Meteor.call('importProducts', "https://sheetsu.com/apis/fe64e183");

      phoneNumbers.forEach(function(phoneNumber) {
        status.invite.push(Meteor.call('sendSMSInvite', phoneNumber, teamId, invitorUserId))
      })

      return status;
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
              cart: EMPTY_CART,
              orders: [],
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
          superUser: (u.hasOwnProperty('superUser') === true && u.superUser === 'TRUE' ) ? true : false
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

    importPurveyors: function(url) {
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
        var teamId = Teams.findOne({teamCode: purveyor.teamCode},{fields:{_id:1}});
        if(teamId === undefined){
          ret.purveyors[purveyor.teamCode] = 'Unable to locate team for: ' + purveyor.teamCode;
          return false
        } else {
          teamId = teamId._id;
        }

        var orderEmails = purveyor.orderEmails;
        if(Meteor.settings.APP.ENV !== 'production' && purveyor.teamCode !== Meteor.settings.APP.DEMO_TEAMCODE){
          orderEmails = Meteor.settings.APP.ORDER_EMAIL;
        }
        // upsert the purveyor
        Purveyors.update(
          { purveyorCode: purveyor.purveyorCode, teamId: teamId, },
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
          { upsert: true }
        )
        ret.purveyors[purveyor.teamCode] = true;
      });

      ret.after = Purveyors.find().count();
      return ret;
    },

    importProducts: function(url) {
      var ret = {
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

        var teamId = Teams.findOne({teamCode: productRow.teamCode},{fields:{_id:1}});
        if(teamId === undefined){
          return false
        } else {
          teamId = teamId._id;
        }

        // id the purveyors by productRow codes
        var purveyorCodes = []
        if(productRow.purveyor1){
          purveyorCodes.push(productRow.purveyor1);
        }
        if(productRow.purveyor2){
          purveyorCodes.push(productRow.purveyor2);
        }
        if(productRow.purveyor3){
          purveyorCodes.push(productRow.purveyor3);
        }
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
            Products.remove({ _id: productRow._id });
            var singleProductCategory = Categories.findOne({products:{$in:[productRow._id]}});
            if(singleProductCategory !== undefined){
              var updatedProducts = singleProductCategory.products;
              var productIdx = updatedProducts.indexOf(productRow._id);
              if(productIdx !== -1){
                updatedProducts = singleProductCategory.products.slice(0, productIdx);
                updatedProducts.concat(singleProductCategory.products.slice(productIdx+1));
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

          // upsert the productRow
          Products.update(
            productLookup,
            {
              $set: {
                name: productRow.name,
                teamId: teamId,
                teamCode: productRow.teamCode,
                description: productRow.description,
                price: productRow.price,
                purveyors: purveyors,
                amount: productRow.amount,
                unit: productRow.unit,
                deleted: false,
                updatedAt: (new Date()).toISOString()
              },
              $setOnInsert: {
                createdAt: (new Date()).toISOString()
              }
            },
            { upsert: true },
            function(err, numOfDocs) {
              if(err){
                log.error('Product import update error: ', err);
                return false;
              }
              var upsertedProduct = Products.findOne(productLookup)
              log.debug('upsertedProduct: ', upsertedProduct)

              if (upsertedProduct !== undefined && productRow.category !== '') {
                log.debug('updating productRow category:', productRow.category)
                var categoryLookup = { name: productRow.category, teamId: teamId};
                var category = Categories.findOne(categoryLookup);
                if(category === undefined){
                  Categories.insert({
                    name: productRow.category,
                    teamId: teamId,
                    teamCode: productRow.teamCode,
                    products: [upsertedProduct._id],
                    deleted: false,
                    createdAt: (new Date()).toISOString(),
                    updatedAt: (new Date()).toISOString()
                  });
                } else {
                  if(category.products.indexOf(upsertedProduct._id) === -1){
                    Categories.update(
                      categoryLookup,
                      {
                        $push : { products: upsertedProduct._id },
                        $set: {
                          updatedAt: (new Date()).toISOString()
                        },
                      }
                    );
                  }
                }
              } // end if productRow.category is not blank

            }.bind(this) // end callback function
          ); // end Products.update
        }
        ret.products.success += 1;
      }); // end response.data.result.forEach

      ret.after = Products.find().count();
      ret.removedCategories = Categories.remove({products: {$size: 0}});
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
        ret.userId = Accounts.createUser({
          username: phoneNumber,
        });

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
      var downloadURL = 'http://sousrails-staging.herokuapp.com/apps';
      // var downloadURL = 'beta.sousapp.com/apps';
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
        bodyMessage = invitor.firstName + ' ' + invitor.lastName[0] + ' is inviting you to ' + team.name;
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
    createMessage: function(messageAttributes) {
      log.debug("MESSAGE ATTRS", messageAttributes);
      if(messageAttributes.imageUrl === ""){
        messageAttributes.imageUrl = "https://lh3.googleusercontent.com/-8e1m8YBYSe0/AAAAAAAAAAI/AAAAAAAAAAA/jRTl40sO4fM/s40/photo.jpg"
      }
      messageAttributes.updatedAt = (new Date()).toISOString();
      var messageId = Messages.insert(messageAttributes);
      log.debug("NEW MESSAGE", messageId);
      var message = `${messageAttributes.author}: ${messageAttributes.message}`

      Meteor.call('triggerPushNotification', message, messageAttributes.teamId)
      return {
        success: true,
        messageId: messageId
      }
    },

    getTeamMessages: function(teamId, lastMessageDate){
      return Messages.find(
        {
          teamId: teamId,
          createdAt: { $lte: lastMessageDate }
        },
        {
          sort: {createdAt: -1},
          limit: 20
        }
      ).fetch();
    },

    createTeam: function(teamAttributes) {
      log.debug("TEAM ATTRS", teamAttributes);
      var team = Teams.findOne({_id: teamAttributes._id, name: teamAttributes.name});
      if(team === undefined){
        teamAttributes.updatedAt = (new Date()).toISOString();
        var teamId = Teams.insert(teamAttributes);
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
      var realTeamId = {_id: teamId};
      log.debug("TEAM ID ", teamId);
      log.debug("TASK ATTRS ", taskAttributes);
      var teamHasTask = Teams.findOne({_id: teamId, "tasks.name": taskAttributes.name},{id:1})
      log.debug(teamHasTask);
      if(teamHasTask === undefined){
        var recipeId = Recipes.insert({
          _id: taskAttributes.recipeId,
          name: taskAttributes.name,
          ingredients: [], // for future use
          createdAt: (new Date()).toISOString(),
          updatedAt: (new Date()).toISOString(),
        });
        Teams.update(realTeamId, {
          $push: {tasks: taskAttributes},
          $set: {updatedAt: (new Date()).toISOString()}
        });
      } else {
        Meteor.call('triggerError',
          'add-error',
          'Team task already exists',
          userId
        )
      }
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

    // addPurveyorProduct: function(purveyorId, productAttributes) {
    //   var realPurveyorId = {_id: purveyorId};
    //   log.debug("PURVEYOR ID ", purveyorId);
    //   log.debug("PRODUCT ATTRS ", productAttributes);
    //   var purveyorHasProduct = Purveyors.findOne({_id: purveyorId, "product.name": productAttributes.name},{id:1})
    //   log.debug(purveyorHasProduct);
    //   if(purveyorHasProduct === undefined){
    //     var productId = Products.insert({
    //       _id: productAttributes.productId,
    //       name: productAttributes.name,
    //       createdAt: (new Date()).toISOString(),
    //       updatedAt: (new Date()).toISOString(),
    //     });
    //     Purveyors.update(realPurveyorId, {
    //       $push: {products: productAttributes},
    //       $set: {updatedAt: (new Date()).toISOString()}
    //     });
    //   } else {
    //     log.error("Purveyor product already exists");
    //     // TODO: publish an error
    //   }
    // },
    //
    // updatePurveyorProduct: function(purveyorId, productId, productAttributes){
    //   log.debug("PURVEYOR ID ", purveyorId);
    //   log.debug("PRODUCT ID ", productId);
    //   log.debug("PRODUCT ATTRS ", productAttributes);
    //   var realPurveyorId = {_id: purveyorId};
    //   var purveyor = Purveyors.findOne(realPurveyorId);
    //   if(purveyor){
    //     // needed to add: meteor add maxharris9:object-assign
    //     // var productIdx = _.findIndex(purveyor.products, function(product) {
    //     //   return product.productId === productId
    //     // });
    //     var productIdx;
    //     log.debug("PURVEYOR ", purveyor);
    //     purveyor.products.forEach(function(product, index) {
    //       if (product.productId == productId)
    //         productIdx = index;
    //     });
    //     purveyor.products[productIdx] = Object.assign({}, purveyor.products[productIdx], productAttributes);
    //     Purveyors.update(realPurveyorId, {
    //       $set: {
    //         products: purveyor.products,
    //         updatedAt: (new Date()).toISOString(),
    //       }
    //     });
    //   }
    //   purveyor = Purveyors.findOne({_id: purveyorId});
    //   log.debug("UPDATED PURVEYOR ", purveyor);
    // },

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

          // Insert order for send
          var orderId = order.id;
          var orderedAt = (new Date()).toISOString();
          Orders.update(
            { _id: orderId },
            {
              $set: {
                userId: userId,
                teamId: teamId,
                teamOrderId: teamOrderId,
                orderedAt: orderedAt,
                purveyorId: purveyorId,
                orderDetails: order,
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
      slack.alert({
        channel: '@kahdojay',
        text: `<@kahdojay> order ${orderId} submitted`,
        icon_emoji: ':moneybag:'
      });
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
        orderProductList.push({
          idx: idx,
          name: product.name || 'Product Name Error',
          sku: product.sku || '',
          quantity: productOrderDetails.quantity * product.amount || 'Quantity Error',
          unit: product.unit,
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
            }
          // TODO: Refactor to use common message library
          Messages.insert(messageAttributes);
          var message = messageAttributes.message
          Meteor.call('triggerPushNotification', message, messageAttributes.teamId)

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
              purveyor: Purveyors.findOne({_id: order.purveyorId}).name,
              type: 'order',
              author: 'Sous',
              teamId: order.teamId,
              createdAt: (new Date()).toISOString(),
              imageUrl: 'https://sous-assets-production.s3.amazonaws.com/uploads/89b217dc-4ec5-43e8-9569-8fc85e6fdd52/New+Sous+Logo+Circle+Small.png',
            }
          // TODO: Refactor to use common message library
          Messages.insert(messageAttributes);
          var message = `Order sent to ${messageAttributes.purveyor}`
          Meteor.call('triggerPushNotification', message, messageAttributes.teamId)
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

    // =====Push Notifications=====
    registerInstallation: function(userId, deviceAttributes) {
      log.debug('registerInstallation userId: ', userId)
      log.debug('registerInstallation token: ', deviceAttributes)

      if(deviceAttributes.hasOwnProperty('token') === true){
        if(deviceAttributes.token.indexOf('Error') === -1){
          // get the user's teamCodes
          var userTeamCodes = Teams.find(
            {
              users: { $in: [userId] },
              notepad: { $exists: false }
            },
            { fields: { teamCode: 1 } }
            ).fetch()
            .map(function(team) { return team.teamCode })

          log.debug('registering installation for team channels (ids): ', userTeamCodes)

          // register installation to channels via the user's teamCodes
          Meteor.http.post(PARSE.INSTALLATION_URL, {
            method: "POST",
            headers: PARSE.HEADERS,
            // body: JSON.stringify(data)
            "data": {
              "deviceType": "ios",
              "deviceToken": deviceAttributes.token,
              "channels": userTeamCodes
            }
          })
        } else {
          log.error('Registration failed due to invalid token');
        }
      } else {
        // TODO: Send error?
      }

    },

    triggerPushNotification: function(message, teamId) {
      if (!message || !teamId) {
        return {
          success: false,
          // errorId: errorId,
          // machineKey: machineKey,
          // userId: userId,
        }
      }
      log.debug('triggerPushNotification: ', message)
      var messageTeam = Teams.findOne({ _id: teamId }, { fields: { teamCode: 1 } })
      var teamCode = messageTeam.teamCode || 'T-' + messageTeam._id
      Meteor.http.post(PARSE.PUSH_URL, {
        method: 'PUSH',
        headers: PARSE.HEADERS,
        "data": {
          "channels": [teamCode],
          "data": {
            "alert": message
          }
        }
      })
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
          emailOptions.to = [{
            email: 'orders@sousapp.com',
            name: 'Orders',
            type: 'to'
          }];
          emailOptions.subject = 'Order Guide Request';
          emailOptions.text = requestAttributes.body;
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

      log.debug('Sending email with options: ', emailOptions);

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
