if(Meteor.isServer){
  Meteor.methods({
    sendPurveyorSMS: function(team, purveyor, orderProductCount, orderId) {
      var twilio = new Twilio(
        Meteor.settings.TWILIO.SID,
        Meteor.settings.TWILIO.TOKEN
      );
      twilio.sendSms({
        to: purveyor.phone,
        from: Meteor.settings.TWILIO.FROM,
        body: `Order emailed from ${team.name} - ${orderProductCount} item(s). Please check your email for order contents. To confirm, Reply All to the email or respond 'ok' to this message.`
      }, Meteor.bindEnvironment( function(err, res) {
        if (err) {
          log.debug('PURVEYOR TEXT RESPONSE: ', res.status)
          log.error('PURVEYOR TEXT ERROR: ', err)
          var purveyorTextErrorSlackAttachments = [
            {
              title: 'Failed purveyorText',
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
                  title: 'Purveyor',
                  value: purveyor.name,
                  short: true
                },
                {
                  title: 'Contact',
                  value: `${purveyor.orderContact} - ${purveyor.phone}`,
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

          slack.alert({
            username: 'Orderbot (mobile)',
            channel: '#dev-errors',
            text: err.message,
            icon_emoji: ':warning:',
            attachments: purveyorTextErrorSlackAttachments
          });
        }
      }.bind(this)))
    }
  })
}
