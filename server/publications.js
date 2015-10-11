Meteor.publish('messages', function(teamKey) {
  return Messages.find({teamKey: teamKey});
});
Meteor.publish('stations', function(teamKey) {
  return Stations.find({teamKey: teamKey});
});
Meteor.publish('purveyors', function(teamKey) {
  return Purveyors.find({teamKey: teamKey});
});
Meteor.publish('restricted', function(phoneNumber) {
  //TODO: check if phoneNumber is valid
  Meteor.users.update({username: phoneNumber}, {
    $set:{
      smsSent: false,
      smsVerified: false,
      smsTokenCount: 0,
      smsToken: null
    }
  });
  return Meteor.users.find({username: phoneNumber},{fields: {
    id: 1,
    smsSent: 1,
    smsVerified: 1,
    smsTokenCount: 1
  }});
});
