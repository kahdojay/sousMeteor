if(Meteor.isServer){
  Meteor.methods({

    // createMessage method
    createMessage: function(messageAttributes, triggerPushNotification) {
      if(undefined === triggerPushNotification){
        triggerPushNotification = true
      }
      log.debug("MESSAGE ATTRS: ", messageAttributes, " triggering push notification: ", triggerPushNotification);
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

      if(triggerPushNotification === true){
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
  })
}
