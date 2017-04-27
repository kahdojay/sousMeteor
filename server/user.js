if(Meteor.isServer){

  Meteor.methods({
    addToNewUserEmailDrip: function(userInfo) {
      log.debug('ADDING USER TO EMAIL DRIP: ', userInfo)
      Meteor.http.post(Mailchimp.LIST_ENDPOINT, {
        headers: Mailchimp.HEADERS,
        "data": {
          "user": "Sous:" + Meteor.settings.MAILCHIMP.APIKEY,
          "email_address": userInfo.email,
          "status": "subscribed",
          "merge_fields": {
            "FNAME": userInfo.firstName || "",
            "LNAME": userInfo.lastName || ""
          }
        }
      }, Meteor.bindEnvironment(function (err, res) {
        if (err) {
          log.error('addToNewUserEmailDrip error: ', err);
        } else {
          slack.alert({
            username: 'mailChimpBot',
            channel: '#app-users',
            icon_emoji: ':monkey_face:',
            text: `Added to mailchimp: ${userInfo.email}`,
            attachments: null
          });

          Meteor.http.post(Mailchimp.AUTOMATION_ENDPOINT, {
            headers: Mailchimp.HEADERS,
            "data": {
              "user": "Sous:" + Meteor.settings.MAILCHIMP.APIKEY,
              "email_address": userInfo.email,
              "status": "subscribed",
              "merge_fields": {
                "FNAME": userInfo.firstName || "",
                "LNAME": userInfo.lastName || ""
              }
            }
          }, Meteor.bindEnvironment(function (err, res) {
            if (err) {
              log.error('addToNewUserEmailDrip error: ', err);
            } else {
              slack.alert({
                username: 'mailChimpBot',
                channel: '#app-users',
                icon_emoji: ':monkey_face:',
                text: `Added to automation: ${userInfo.email}`,
                attachments: null
              });
            }
            log.trace('addToNewUserEmailDrip response: ', res);
          }));
        }
        log.trace('addToNewUserEmailDrip response: ', res);
      }));
    },

    trackUsers: function() {
      var allUsers = Meteor.users.find().fetch();
      log.debug('Processing all the users: ', allUsers.length);
      allUsers.forEach(function(user) {
        var userSettings = Settings.findOne({userId: user._id});

        var setValues = {
          '$first_name': user.firstName,
          '$last_name': user.lastName,
          '$email': user.email,
          '$created': user.createdAt,
          'phoneNumber': user.username,
        }
        if(userSettings){
          setValues['settings__appBuildNumber'] = userSettings.appBuildNumber || 'unkown';
          setValues['settings__appVersion'] = userSettings.appVersion || 'unkown';
          setValues['settings__deviceId'] = userSettings.deviceId || 'unkown';
          setValues['settings__deviceName'] = userSettings.deviceName || 'unkown';
          setValues['settings__model'] = userSettings.model || 'unkown';
          setValues['settings__systemName'] = userSettings.systemName || 'unkown';
          setValues['settings__systemVersion'] = userSettings.systemVersion || 'unkown';
        }
        // console.log(setValues);
        mixpanel.people.set(user._id, setValues, {
          $ignore_time: true
        });
      })
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

      // var addPlus = false
      // if(phoneNumber.substr(0,1) === '+'){
      //   addPlus = true
      // }
      phoneNumber = phoneNumber.toString().replace(/\D/g, '');

      if(phoneNumber.length === 11 && phoneNumber[0] === '1'){
        // if(addPlus === true){
        //   phoneNumber = `+${phoneNumber}`
        // } else {
          phoneNumber = phoneNumber.slice(1)
        // }
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
          oneSignalId: null,
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
      var admin = true;
      teams.forEach(function(team){
        Meteor.call('removeUserFromTeam', userId, team._id, admin)
      })

      setTimeout(Meteor.bindEnvironment(function(){
        //clear out user's data
        Meteor.users.update({_id:userId}, {$set: {
          teamId: null,
          oneSignalId: null,
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

    getUsersTeams: function(userId) {
      return Teams.find({users: {$in: [userId]}}).fetch();
    },

    removeUser: function(phoneNumber) {
      var userPkg = Meteor.call('getUserByPhoneNumber', phoneNumber);
      var teams = Meteor.call('getUsersTeams', phoneNumber)
      teamCodes = _.pluck(teams, 'teamCode');
      Meteor.call('removeUserFromTeamsByTeamCodes', phoneNumber, teamCodes)
      Meteor.users.remove({ _id: userPkg.userId })
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

      var admin = true;
      teamCodes.forEach(function(teamCode){
        var team = Teams.findOne({teamCode:teamCode},{fields:{users:1}});
        var remove = Meteor.call('removeUserFromTeam', userPkg.userId, team._id, admin)
        log.debug(remove)
      })
    },

    removeUserFromTeam: function(userId, teamId, admin){
      log.debug("Removing user: " + userId + " from team: " + teamId);
      var ret = {
        remove: null,
        missing: null,
      };
      var team = Teams.findOne({_id: teamId},{fields:{users:1}});
      if(team){
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
      } else {
        if(admin){
          var data = {
            userId: userId,
            teamId: teamId,
          }
          var dataString = "\n" + '```' + JSON.stringify(data, null, 2) + '```'
          slack.alert({
            username: 'errorBot',
            channel: '#dev-errors',
            icon_emoji: ':warning:',
            text: `Error removing user from team: ${dataString}`,
            attachments: null
          });
        } else {
          Meteor.call('triggerError',
            'technical-error:missing-team',
            'Error removing user from team.',
            userId
          )
        }
      }

      return ret;
    },

    joinUsersByPhone: function(numberToAdd, numberToJoin) {
      toJoinId = Meteor.users.findOne({username:numberToJoin})._id
      log.debug('toJoinId: ', toJoinId)
      var teamsToJoin = Teams.find({users: {$in: [toJoinId]}}).fetch()
      log.debug('teamsToJoin: ', teamsToJoin)
      var teamCodesToJoin = _.pluck(teamsToJoin, 'teamCode')
      log.debug('teamCodesToJoin: ', teamCodesToJoin)
      Meteor.call('addUserToTeamCodes', numberToAdd, teamCodesToJoin)
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
      var downloadURL = Meteor.settings.APP.DOWNLOAD_URL;
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
              var slackAttachments = [
                {
                  fields: [
                    {
                      title: 'Name',
                      value: `${user.firstName} ${user.lastName}` || 'N/A',
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

              if(team){
                slackAttachments[0].fields.push({
                  title: 'Team Name',
                  value: team.name,
                  short: true
                })
              }

              slack.alert({
                username: 'Sous App',
                channel: '#app-actions',
                text: `SMS Request`,
                attachments: slackAttachments,
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
          var slackAttachments = [
            {
              fields: [
                {
                  title: 'Name',
                  value: `${user.firstName} ${user.lastName}`,
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

          if(team){
            slackAttachments[0].fields.push({
              title: 'Team Name',
              value: team.name,
              short: true
            })
          }

          slack.alert({
            username: 'Sous App',
            channel: '#app-actions',
            text: `SMS Login`,
            attachments: slackAttachments,
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
          const slackAttachments = [
            {
              title: 'User Update',
              fields: []
            }
          ]
          for (var property in userAttributes) {
            if (userAttributes.hasOwnProperty(property)) {
              slackAttachments[0].fields.push({
                title: property || 'Error: property not found',
                value: userAttributes[property] || 'Error: value not found',
                short: true
              })
            }
          }
          if(team){
            slackAttachments[0].fields.push({
              title: 'Team Name',
              value: team.name,
              short: true
            })
          }
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
  })
}
