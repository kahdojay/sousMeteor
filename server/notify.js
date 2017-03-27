/* @flow */
var oneSignal = require('node-opensignal-api');
var oneSignalClient = oneSignal.createClient();

var DEBUG_ONESIGNAL_PUSH = true; // tmp. variable, to skip 2nd if stmt.

if(Meteor.isServer){
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

    // =====Push Notifications=====
    registerInstallation: function(userId, deviceAttributes) {
      log.trace('registerInstallation userId: ', userId)
      log.trace('registerInstallation deviceAttributes: ', deviceAttributes)

      var tokenValid = false
      if(deviceAttributes.token.indexOf('Error') === -1){
        tokenValid = true
      }
      tokenValid = true
      if (deviceAttributes.hasOwnProperty('token') === true) {
        if (tokenValid === true) {
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
          var osTypeIOS = "ios";
          var osType = osTypeIOS;

          var data = {
            "installationId": installationId,
            "appVersion": deviceAttributes.appVersion,
            "appBuildNumber": deviceAttributes.appBuildNumber,
            "deviceType": osTypeIOS,
            "deviceToken": deviceAttributes.token,
            "deviceModel": deviceAttributes.model,
            "deviceId": deviceAttributes.deviceId,
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

          if (update.success !== true) { // OneSignal registration
            var oneSignalClientParams = {
            	app_id: ONESIGNAL.APP_ID,
            	device_type: 'ios',
              device_model: deviceAttributes.model,
              device_os: deviceAttributes.systemVersion,
              identifier: deviceAttributes.token,
              language: 'en',
              test_type: 1 // 1 = Development, 2 = Ad-Hoc, //TODO: Omit this field for App Store builds.
            };

            oneSignalClient.players.create(oneSignalClientParams, Meteor.bindEnvironment(function (err, response) {
            	if (err) {
              	log.error('ONESIGNAL 1 - registerInstallation error: ', err);
                return;
            	}

              log.debug('registering installation 1 response', response);

              var oneSignalId = response.id;
              log.debug('ONESIGNAL 1 - registerInstallation: returned oneSignalId ', oneSignalId);

              data.oneSignalId = oneSignalId;
              data.updatedAt = (new Date()).toISOString();

              Settings.update({userId: userId}, {$set:data});
              Meteor.users.update({_id: userId}, {$set: {oneSignalId: oneSignalId}});

            }));
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
        if (!userSettings.hasOwnProperty('oneSignalId') === true || !userSettings.oneSignalId ||
            !userSettings.hasOwnProperty('deviceId') === true || !userSettings.deviceId) { // update OneSignal for existing users if oneSignalId does not exist
          ret.success = false;
          ret.error = [{
            message: 'Could not find settings for oneSignalId or deviceId'
          }];
        } else { // update user settings with lastUpdatedAt
          var processUpdate = false;
          var updateDataAttributes = {};

          Object.keys(dataAttributes).forEach(function(key) {
            if (APPROVED_PARSE_UPDATE_ATTRS[key] === 1) {
              updateDataAttributes[key] = dataAttributes[key]
              processUpdate = true;
            }
          });

          if (processUpdate) {
            dataAttributes.updatedAt = (new Date()).toISOString();
            Settings.update({userId: userId}, {$set:dataAttributes});
          }
          ret.success = true;
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

      // TODO: get all users from team and get each users oneSignalId
      // var oneSignalIds = [...];

      Meteor.http.post(ONESIGNAL.CREATE_NOTIFICATION_URL, {
        headers: ONESIGNAL.HEADERS,
        body: JSON.stringify({
          app_id: ONESIGNAL.APP_ID,
          include_player_ids: [], // TODO: see todo above
          contents: {
            en: message
          }
        })
      }, Meteor.bindEnvironment(function(error, response, body) {
        if (error) {
          var slackAttachments = [
            {
              title: 'Push Notification Error',
              color: 'danger',
              fields: [
                {
                  title: 'Team Name',
                  value: messageTeam.name,
                  short: true
                },
                {
                  title: 'Author',
                  value: `${message.author}`,
                  short: true
                },
                {
                  title: 'Team Code',
                  value: messageTeam.teamCode,
                  short: true
                },
                {
                  title: 'Message',
                  value: message,
                  short: true
                },
              ]
            }
          ]

          var alertMsg = []
          alertMsg.push('<!channel> Meteor Push Notification Error!');
          alertMsg.push('');
          alertMsg.push('*Error*');
          alertMsg.push(`${error}`);
          alertMsg.push('');

          slack.alert({
            username: 'Exceptionbot (mobile)',
            channel: '#dev-errors',
            text: alertMsg.join('\n'),
            icon_emoji: ':rotating_light:',
            attachments: slackAttachments
          });

          return;
        }
      }));
      Meteor.call('updateInstallation', userId, {"badge": 0});
    }
  })
}
