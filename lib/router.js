Router.route('/', {
  name: 'home',

  data: function() {
    return []
  }
});

Router.route('build', {
  where: 'server',
  path: '/build-info.json',
  action: function () {
    var json = {error: true};
    Meteor.call('getBuildInfo', function(err, buildInfo){
      console.log(buildInfo)
      json = buildInfo;
    });
    this.response.writeHead(200, {'Content-Type': 'application/json'});
    this.response.end(JSON.stringify(json));
  }
});

Router.route('sms', {
  where: 'server',
  path: '/api/twiml/sms',
  action: function () {
    var xml = '<Response><Message>Thanks for confirming!</Message></Response>';
    this.response.writeHead(200, {'Content-Type': 'text/xml'});
    this.response.end(xml);

    log.debug('TWILIO SMS PARAMS: ', this.params)
    var testMessage = { 
      author: 'Twilio',
      delete: false,
      imageUrl: 'https://sous-assets-production.s3.amazonaws.com/avatar_BrJTYiK9FocfPJiAM.jpg',
      message: 'message from Twilio',
      teamId: 'mn34jWL3r9PTRWfkw',
      // teamId: 'cRKmi2C5FcEz9t5xa',
      userId: 'ZxysYPH9oZeWXtyMv',
      // userId: 'jQFDysefypfdETcqn',
      createdAt: new Date().toISOString(),
    }
    Meteor.call('createMessage', testMessage, true)
  }
});

// Router.route('/api/twiml/sms')
//   .get(function() {
//     var xml = '<Response><Message>Thanks for confirming!</Message></Response>';
//     console.log('this', this, xml)
//     return [200, {"Content-Type": "text/xml"}, xml];
//   })
//   .post(function() {
//     var xml = '<Response><Message>Thanks for confirming!</Message></Response>';
//     return [200, {"Content-Type": "text/xml"}, xml];
//   })