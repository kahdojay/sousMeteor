_ = lodash
log = logger.bunyan.createLogger({
  name: 'Sous',
  stream: process.stdout.isTTY ?
            new logger.bunyanPrettyStream(process.stdout) :
            process.stdout,
  level: 'debug'
})

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

var STATUS = {
  USER: { NEW: 'NEW', EXISTING: 'EXISTING' },
  MESSAGE: { NEW: 'NEW', EXISTING: 'EXISTING' },
  NOTEPAD: { NEW: 'NEW', EXISTING: 'EXISTING' }
};

// TODO figure out how to factor out util methods in meteor block
//var sanitzeString = function(input) {
//  return input.toString().replace(/\D/g, '');
//}
//

// Mandrill.config({
//   username: Meteor.settings.MANDRILL.USERNAME,  // the email address you log into Mandrill with. Only used to set MAIL_URL.
//   key: Meteor.settings.MANDRILL.API_KEY  // get your Mandrill key from https://mandrillapp.com/settings/index
//   // port: Meteor.settings.MANDRILL.PORT,  // defaults to 465 for SMTP over TLS
//   // host: Meteor.settings.MANDRILL.HOST,  // the SMTP host
//   // baseUrl: Meteor.settings.MANDRILL.BASEURL  // update this in case Mandrill changes its API endpoint URL or version
// });
// // TEMPLATES
// //   SEND_ORDER: Meteor.settings.MANDRILL.TEMPLATES.SEND_ORDER
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
    status.import.purveyors = Meteor.call('importPurveyors', "https://sheetsu.com/apis/06d066f5");
    status.import.products = Meteor.call('importProducts', "https://sheetsu.com/apis/d1d0cbb3");

    var firstTeam = Teams.findOne({}, {sort: {createdAt: 1}});
    var teamId = firstTeam._id;
    var invitorUserId = firstTeam.users[0];

    phoneNumbers.forEach(function(phoneNumber) {
      status.invite.push(Meteor.call('sendSMSInvite', phoneNumber, teamId, invitorUserId))
    })

    return status;
  },

  importTeams: function(url) {
    var ret = {
      'before': null,
      'after': null
    }
    ret.before = Teams.find().count();

    var response = Meteor.http.get(url, {timeout: 10000});
    var newTeams = response.data.result
    newTeams.forEach(function(t) {
      newTeamId = Teams.insert(Object.assign(t, {
        tasks: [],
        categories: [],
        users: [],
        cart: {
          date: null,
          total: 0.0,
          orders: {}
        },
        orders: [],
        deleted: false,
        createdAt: (new Date()).toISOString(),
        updatedAt: (new Date()).toISOString()
      }));
    });

    ret.after = Teams.find().count();
    return ret;
  },

  importUsers: function(url) {
    var ret = {
      'before': null,
      'after': null
    }
    ret.before = Meteor.users.find().count();

    var response = Meteor.http.get(url, {timeout: 10000});
    var newUsers = response.data.result
    newUsers.forEach(function(u) {

      log.debug(u)
      var userPkg = Meteor.call('getUserByPhoneNumber', u.phone);
      var user = userPkg.user;

      // update user with some default data
      Meteor.users.update({_id: userPkg.userId}, {$set: {
        email: u.email,
        phone: u.phone,
        firstName: u.firstName,
        lastName: u.lastName,
      }})

      // associate with teams
      teams = u.teamNames.replace(/^\s+|\s+$/g,"").split(/\s*,\s*/)
      teams.forEach(function(teamName) {
        log.debug(`adding ${u.firstName} to ${teamName}`)
        // find the team, add user
        Teams.update(
          { name: teamName },
          {
            $push: { users: userPkg.userId },
            $set: {
              deleted: false,
              updatedAt: (new Date()).toISOString()
            },
            $setOnInsert: {
              tasks: [],
              categories: [],
              users: [],
              cart: {
                date: null,
                total: 0.0,
                orders: {}
              },
              orders: [],
              deleted: false,
              createdAt: (new Date()).toISOString()
            }
          },
          { upsert: true }
        )
        // NOTE: why does the user need teams attribute?
        // team = Teams.findOne({ name: teamName })
        // // add team to user's teams array
        // Meteor.users.update(
        //   { _id: userId },
        //   {
        //     $push: { teams: team._id },
        //     $set: { updatedAt: (new Date()).toISOString() }
        //   }
        // )
      })

    });

    ret.after = Meteor.users.find().count();
    return ret;
  },

  importPurveyors: function(url) {
    var ret = {
      'before': null,
      'after': null
    }
    ret.before = Purveyors.find().count();

    // insert purveyors with purveyorCode
    var response = Meteor.http.get(url, {timeout: 10000})
    log.debug('importPurveyors response:', response.data.result)
    response.data.result.forEach(function(purveyor) {
      // upsert the purveyor
      Purveyors.update(
        { purveyorCode: purveyor.purveyorCode },
        {
          $set: {
            purveyorCode: purveyor.purveyorCode,
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
            orderEmails: purveyor.orderEmails,
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
    });

    ret.after = Purveyors.find().count();
    return ret;
  },

  importProducts: function(url) {
    var ret = {
      'before': null,
      'after': null
    }
    ret.before = Products.find().count();

    var response = Meteor.http.get(url, {timeout: 10000})
    // log.debug('importProducts response:', response)
    // get all purveyors
    response.data.result.forEach(function(productRow) {
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
        Purveyors.update(
          { purveyorCode: purveyorCode },
          {
            $set: {
              purveyorCode: purveyorCode,
              updatedAt: (new Date()).toISOString()
            },
            $setOnInsert: {
              name: purveyorCode,
              company: '',
              city: '',
              state: '',
              zipCode: '',
              timeZone: '',
              orderCutoffTime: '',
              orderMinimum: '',
              deliveryDays: '',
              notes: '',
              email: '',
              phone: '',
              orderContact: '',
              description: '',
              deleted: false,
              sendEmail: false,
              missing: true,
              createdAt: (new Date()).toISOString()
            }
          },
          { upsert: true }
        )

        purveyor = Purveyors.findOne({ purveyorCode: purveyorCode })
        log.debug('PURVEYOR ID: ', purveyor._id);
        purveyors.push(purveyor._id);
      })

      log.debug('SETTING PURVEYORS: ', purveyors)

      // upsert the productRow
      Products.update(
        { name: productRow.name },
        {
          $set: {
            name: productRow.name,
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
        function() {
          var upsertedProduct = Products.findOne({ name: productRow.name })
          var teamId = Teams.findOne({ name: productRow.teamName })._id
          log.debug('upsertedProduct: ', upsertedProduct)

          // TODO: instead of exposing all categories, put the product in the right category
          if (productRow.category !== '') {
            log.debug('updating productRow category:', productRow.category)
            Categories.update(
              {
                name: productRow.category
                // TODO: limit by teamId
                // $where: function() {
                // return
                //   (this.name === category.name) &&
                //   (this.teams.indexOf(teamId) !== -1)
                // }
              },
              {
                $push : { products: upsertedProduct._id },
                $set: {
                  name: productRow.category,
                  deleted: false,
                  updatedAt: (new Date()).toISOString()
                },
                $setOnInsert: {
                  createdAt: (new Date()).toISOString()
                }
              },
              { upsert: true }
            )
          } // end if productRow.category is not blank

        } // end callback function
      ); // end Products.update
    }); // end response.data.result.forEach

    ret.after = Products.find().count();
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
        categories: [],
        users: [userId],
        notepad: true,
        cart: {
          date: null,
          total: 0.0,
          orders: {}
        },
        orders: [],
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
      // make sure that Notepad exists
      ret.notepadExists = Meteor.call('getUserNotepad', ret.userId);
      ret.success = true;
    }
    // create a new user
    else {
      ret.status = STATUS.USER.NEW;
      log.debug('creating new user associated with ' + phoneNumber)
      ret.userId = Accounts.createUser({
        username: phoneNumber,
      });

      // make sure that Notepad exists
      ret.notepadExists = Meteor.call('getUserNotepad', ret.userId);

      Meteor.users.update({_id: ret.userId}, {$set: {
        teamId: ret.notepadExists.teamId,
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

    // Invite the user to the team
    Teams.update({_id: teamId}, {
      $push: {users: invitee.userId},
      $set: {updatedAt: (new Date()).toISOString()}
    });

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
          Meteor.users.update(
            {_id: user._id},
            { $set: {
                smsToken: smsToken,
                smsSent: true,
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
    // log.debug('UPDATE: ', update, ' with: ', userAttributes)
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
    return {
      success: true,
      messageId: messageId
    }
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
    Teams.update(realTeamId, {$set: teamAttributes});
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

  addPurveyorProduct: function(purveyorId, productAttributes) {
    var realPurveyorId = {_id: purveyorId};
    log.debug("PURVEYOR ID ", purveyorId);
    log.debug("PRODUCT ATTRS ", productAttributes);
    var purveyorHasProduct = Purveyors.findOne({_id: purveyorId, "product.name": productAttributes.name},{id:1})
    log.debug(purveyorHasProduct);
    if(purveyorHasProduct === undefined){
      var productId = Products.insert({
        _id: productAttributes.productId,
        name: productAttributes.name,
        createdAt: (new Date()).toISOString(),
        updatedAt: (new Date()).toISOString(),
      });
      Purveyors.update(realPurveyorId, {
        $push: {products: productAttributes},
        $set: {updatedAt: (new Date()).toISOString()}
      });
    } else {
      log.error("Purveyor product already exists");
      // TODO: publish an error
    }
  },

  updatePurveyorProduct: function(purveyorId, productId, productAttributes){
    log.debug("PURVEYOR ID ", purveyorId);
    log.debug("PRODUCT ID ", productId);
    log.debug("PRODUCT ATTRS ", productAttributes);
    var realPurveyorId = {_id: purveyorId};
    var purveyor = Purveyors.findOne(realPurveyorId);
    if(purveyor){
      // needed to add: meteor add maxharris9:object-assign
      // var productIdx = _.findIndex(purveyor.products, function(product) {
      //   return product.productId === productId
      // });
      var productIdx;
      log.debug("PURVEYOR ", purveyor);
      purveyor.products.forEach(function(product, index) {
        if (product.productId == productId)
          productIdx = index;
      });
      purveyor.products[productIdx] = Object.assign({}, purveyor.products[productIdx], productAttributes);
      Purveyors.update(realPurveyorId, {
        $set: {
          products: purveyor.products,
          updatedAt: (new Date()).toISOString(),
        }
      });
    }
    purveyor = Purveyors.findOne({_id: purveyorId});
    log.debug("UPDATED PURVEYOR ", purveyor);
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

  sendCart: function(userId, teamId, teamOrderId) {
    // double check if cart has any items
    var realTeamId = {_id: teamId}
    log.debug('SEND CART PARAMS ', userId, teamId, teamOrderId);
    var team = Teams.findOne(realTeamId, {cart: 1});
    log.info('TEAM CART ', team.cart);
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
          orderedAt: (new Date()).toISOString(),
          purveyorId: purveyorId,
          orderDetails: order,
          sent: false,
          error: false,
          mandrillResponse: null,
          createdAt: teamCart.date,
          updatedAt: (new Date()).toISOString(),
        });

        // update the team orders
        Teams.update(realTeamId, {
          $push: {
            orders: { id: orderId, sent: false, error: false }
          },
          $set: {
            updatedAt: (new Date()).toISOString(),
          }
        });

        // send the orders
        log.debug('INSERT: ', orderId);
        log.info("EXECUTE sendOrder with: ", order.id);
        var orderSent = Meteor.call('sendOrder', order.id);

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
            cart: { date: null, total: 0.0, orders: {} },
            updatedAt: (new Date()).toISOString(),
          }
        });
      // }

    } else {
      Meteor.call('triggerError',
        'technical-error:order',
        'Your cart is empty - please add items before submitting an order.',
        userId
      )
    }
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
            message: 'Error - Order to ' +
              purveyorName +
              ' failed to send. Sous has been notified, but please send this order to ' +
              purveyorName +
              ' directly. We apologize for the inconvenience.',
            author: 'Sous',
            teamId: order.teamId,
            createdAt: (new Date()).toISOString(),
            imageUrl: 'https://sous-assets-production.s3.amazonaws.com/uploads/89b217dc-4ec5-43e8-9569-8fc85e6fdd52/New+Sous+Logo+Circle+Small.png',
          }
        Messages.insert(messageAttributes);

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
        Messages.insert(messageAttributes);
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
  }
})
