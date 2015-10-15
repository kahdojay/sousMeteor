Meteor.publish('messages', function(teamId) {
  return Messages.find({teamId: teamId}, {sort: {createdAt: 1}, limit:20});
});
Meteor.publish('stations', function(teamId) {
  return Stations.find({teamId: teamId});
});
Meteor.publish('purveyors', function(teamId) {
  return Purveyors.find({teamId: teamId});
});
Meteor.publish('errors', function(userId) {
  return Errors.find({userId: userId});
});
Meteor.publish('restricted', function(phoneNumber) {
  var users = Meteor.users.find({username: phoneNumber},{fields: {
    smsToken: 0,
    password: 0,
    services: 0
  }});
  return users;
});
