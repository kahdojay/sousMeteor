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
    log.debug('TWILIO SMS PARAMS: ', this.params)
    var order = Orders.findOne({orderRef: this.params.query.Body.toUpperCase().trim()})
    log.debug('ORDER LOOKUP: ', order)
    if(order !== undefined){
      // Insert message into Team Feed
      var purveyor = Purveyors.findOne({_id: order.purveyorId})
      var imageUrl = (purveyor.imageUrl && !!purveyor.imageUrl.trim()) ? purveyor.imageUrl : 'https://sous-assets-production.s3.amazonaws.com/uploads/89b217dc-4ec5-43e8-9569-8fc85e6fdd52/New+Sous+Logo+Circle+Small.png'
      var author = purveyor.orderContact && !!purveyor.orderContact.trim() ? purveyor.orderContact : purveyor.name
      var teamConfirmMessage = {
        type: 'purveyorConfirmation',
        author: author,
        message: 'Order confirmed',
        teamId: order.teamId,
        orderId: order._id,
        purveyorId: order.purveyorId,
        purveyor: purveyor.name,
        imageUrl: imageUrl,
        createdAt: new Date().toISOString(),
      }
      Meteor.call('createMessage', teamConfirmMessage, true)
      var xml = '<Response><Message>Thanks for confirming!</Message></Response>';
      this.response.writeHead(200, {'Content-Type': 'text/xml'});
      this.response.end(xml);

      // Update the order's comments
      var updatedComments = order.comments || [];
      updatedComments.unshift({
        author: author,
        createdAt: new Date().toISOString(),
        text: 'Order confirmed',
        imageUrl: imageUrl
      })
      Meteor.call('updateOrder', order.userId, order._id, {
        comments: updatedComments
      })
    } else {
      var purveyorMsg = 'Order reference unrecognized, please try again or email us at sous@sousapp.com.'
      Meteor.call('sendPurveyorSMS', null, purveyor, null, purveyorMsg)
    }
  }
});
