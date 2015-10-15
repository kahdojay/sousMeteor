//TODO: set TTL settings on errors
Errors = new Mongo.Collection('errors');
// Configure to use twilio.
// Accounts.sms.configure({
//   twilio: {
//     from: Meteor.settings.TWILIO.FROM,
//     sid: Meteor.settings.TWILIO.SID_PROD,
//     token: Meteor.settings.TWILIO.TOKEN
//   }
// });
Messages = new Mongo.Collection('messages');
Stations = new Mongo.Collection('stations');
Recipes = new Mongo.Collection('recipes');
Purveyors = new Mongo.Collection('purveyors');
Products = new Mongo.Collection('products');
Teams = new Mongo.Collection('teams');

Object.assign = Object.assign || objectAssign;

var allowPermissions = {
  insert: function() {return true;},
  update: function() {return true;},
  remove: function() {return true;}
};
Stations.allow(allowPermissions);
Messages.allow(allowPermissions);
Purveyors.allow(allowPermissions);
Errors.allow(allowPermissions);
Teams.allow(allowPermissions);

// TODO figure out how to factor out util methods in meteor block
//var sanitzeString = function(input) {
//  return input.toString().replace(/\D/g, '');
//}

// Meteor.call('createMessage', [messageAttributes])
Meteor.methods({
  sendSMSInvite: function(phoneNumber, teamId, inviteeUserId) {
    //phoneNumber = sanitizeString(phoneNumber);
    phoneNumber = phoneNumber.toString().replace(/\D/g, '');
    var user = Meteor.users.findOne({username: phoneNumber});
    var invitee = Meteor.users.findOne({ _id: inviteeUserId });
    var downloadURL = 'http://google.com'
    var twilio = new Twilio(
      Meteor.settings.TWILIO.SID_PROD,
      Meteor.settings.TWILIO.TOKEN
    )
    var bodyMessage = '';

    if (user === undefined) {
      var userId = Accounts.createUser({
        username: phoneNumber,
        teamId: teamId
      });
      // TODO: cant the update below be merged with createUser above?
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
      user = Meteor.users.findOne({username: phoneNumber});
      bodyMessage = invitee.firstName + ' ' + invitee.lastName + ' is inviting you to Sousapp! ' + downloadURL;
    } else {
      // TODO convert over to the new team functionality
      Meteor.users.update({_id: userId}, {$set: {
        teamId: teamId
      }})
      var team = Teams.findOne({_id: teamId});
      bodyMessage = invitee.firstName + ' ' + invitee.lastName + ' is inviting you to ' + team.name;
    }

    twilio.sendSms({
      to: phoneNumber,
      from: Meteor.settings.TWILIO.FROM,
      body: bodyMessage
    }, Meteor.bindEnvironment( function(err, responseData) {
      if (err) {
        Errors.insert({
          userId: invitee._id,
          machineId: 'technical-error:sms',
          message: 'We apologize for the inconvenience, but we are experiencing technical difficulties. Please try again later.',
          createdAt: (new Date).getTime(),
        })
      }
    }))
  },
  sendSMSCode: function(phoneNumber){
    var user = Meteor.users.findOne({username: phoneNumber});
    console.log('User FOUND:', user)
    if (user === undefined) {
      var teamId = Teams.insert({
        name: 'Notepad'
      })
      var userId = Accounts.createUser({
        username: phoneNumber,
        teamId: teamId
      });
      // TODO: cant the update below be merged with createUser above?
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
      user = Meteor.users.findOne({username: phoneNumber});
    }

    var twilio = new Twilio(
      Meteor.settings.TWILIO.SID_PROD,
      Meteor.settings.TWILIO.TOKEN
    )
    var smsToken = Math.floor(1000 + Math.random() * 9000)

    // limit the number of times a user can be sent an sms token to 10 before having to contact us directly
    if (user.smsTokenCount <= 10) {
      console.log('sending smsToken to ' + phoneNumber + ': ' + smsToken)
      twilio.sendSms({
        to: phoneNumber,
        from: Meteor.settings.TWILIO.FROM,
        body: smsToken + ' is your Sous verification code.'
      }, Meteor.bindEnvironment( function(err, responseData) {
        if (!err) {
          Meteor.users.update({_id: user._id}, {$set: {
            authToken: null,
            smsToken: smsToken,
            smsSent: true,
            smsVerified: false,
            smsTokenCount: 0 // reset token count back to 0
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
    } else {
      Errors.insert({
        userId: user._id,
        machineId: 'token-limit',
        message: 'You have reached token limit, please contact us.',
        createdAt: (new Date).getTime(),
      })
    }
  },
  loginWithSMS: function(phoneNumber, token){
    console.log('LOGINWITHSMS: ', phoneNumber, token)
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
        authToken: hashStampedToken
      };
      if(user.hasOwnProperty('teamId') === false || !user.teamId){
        var teamId = Teams.insert({
          name: 'Notepad'
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
  createStation: function(stationAttributes) {
    console.log("STATION ATTRS", stationAttributes);
    var station = Stations.findOne({teamId: stationAttributes.teamId, name: stationAttributes.name});
    if(station === undefined){
      var stationId = Stations.insert(stationAttributes);
      var station = Stations.findOne({_id: stationId});
      console.log("CREATED STATION", station);
    } else {
      console.log("Station already exists");
      // TODO: publish an error
    }
  },
  updateStation: function(stationId, stationAttributes) {
    Stations.update(stationId, {$set: {stationAttributes}});
  },
  addStationTask: function(userId, stationId, taskAttributes) {
    var realStationId = {_id: stationId};
    console.log("STATION ID ", stationId);
    console.log("TASK ATTRS ", taskAttributes);
    var stationHasTask = Stations.findOne({_id: stationId, "tasks.name": taskAttributes.name},{id:1})
    console.log(stationHasTask);
    if(stationHasTask === undefined){
      var recipeId = Recipes.insert({
        _id: taskAttributes.recipeId,
        name: taskAttributes.name,
        ingredients: [] // for future use
      });
      Stations.update(realStationId, {$push: {tasks: taskAttributes}});
    } else {
      Errors.insert({
        userId: userId,
        machineId: 'add-error',
        message: 'Station task already exists',
        createdAt: (new Date).getTime(),
      })
    }
  },
  updateStationTask: function(stationId, recipeId, taskAttributes){
    console.log("STATION ID ", stationId);
    console.log("RECIPE ID ", recipeId);
    console.log("TASK ATTRS ", taskAttributes);
    var realStationId = {_id: stationId};
    var station = Stations.findOne(realStationId);
    if(station){
      // needed to add: meteor add maxharris9:object-assign
      // var taskIdx = _.findIndex(station.tasks, function(task) {
      //   return task.recipeId === recipeId
      // });
      var taskIdx;
      // console.log("STATION", station);
      station.tasks.forEach(function(task, index) {
        if (task.recipeId == recipeId)
          taskIdx = index;
      });
      station.tasks[taskIdx] = Object.assign({}, station.tasks[taskIdx], taskAttributes);
      Stations.update(realStationId, {$set: {tasks: station.tasks}});
    }
    station = Stations.findOne({_id: stationId});
    console.log("UPDATED STATION", station);
  },
  deleteStation: function(stationId) {
    console.log("DELETE STATION", stationId);
    Stations.update(stationId, {$set: {deleted: true}});
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

})
