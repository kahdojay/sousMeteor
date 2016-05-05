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
      var queryData = {
        "where": {
          "channels": channel,
        },
        "data": {
          "alert": message,
          "badge": "Increment"
        }
      }
      if(user !== undefined){
        queryData['where']["$ne"] = {
          "phoneNumber": user.username
        }
      }
      try {
        Meteor.http.post(PARSE.PUSH_URL, {
          method: 'PUSH',
          headers: PARSE.HEADERS,
          "data": queryData,
        }, Meteor.bindEnvironment(function(err, res){
          if(err){
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
            alertMsg.push(`${err}`);
            alertMsg.push('');

            slack.alert({
              username: 'Exceptionbot (mobile)',
              channel: '#dev-errors',
              text: alertMsg.join('\n'),
              icon_emoji: ':rotating_light:',
              attachments: slackAttachments
            });
          }
        }))
      } catch (err){
        var slackAttachments = [
          {
            title: 'Push Notification Exception',
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
        alertMsg.push('<!channel> Meteor triggerPushNotification Exception!');
        alertMsg.push('');
        alertMsg.push('*Error*');
        alertMsg.push(`${err}`);
        alertMsg.push('');
        alertMsg.push('*Stack Trace*');
        alertMsg.push((err.stack) ? '```'+err.stack+'```' : '`...`');
        alertMsg.push('');

        slack.alert({
          username: 'Exceptionbot (mobile)',
          channel: '#dev-errors',
          text: alertMsg.join('\n'),
          icon_emoji: ':rotating_light:',
          attachments: slackAttachments
        });
      }
      Meteor.call('updateInstallation', userId, {"badge": 0});
    },
  })
}
