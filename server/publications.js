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
  return Meteor.users.find({username: phoneNumber},{fields: {
    id: 1,
    username: 1,
    firstName: 1,
    lastName: 1,
    teamId: 1,
    authToken: 1,
    smsSent: 1,
    smsVerified: 1,
    smsTokenCount: 1
  }});
});
