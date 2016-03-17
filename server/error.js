if(Meteor.isServer){
  Meteor.methods({

    createError: function(msg) {
      log.error('creating error: ', msg)
      return Meteor.call('triggerError',
        'test',
        'test error: [' + msg + ']',
        Meteor.users.findOne({ username: '8067892921' })._id
      )
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
  })
}
