// if(Meteor.isClient){
//   Session.setDefault('buildInfo', {});
//
//   Template.footer.helpers({
//     copyrightYear: function() {
//       return (new Date()).getFullYear()
//     },
//     buildInfo: function(){
//       return Session.get('buildInfo');
//     }
//   });
//
//   Template.footer.onCreated(function(){
//     var buildInfo = Meteor.call('getBuildInfo', function(err, buildInfo){
//       Session.set('buildInfo', buildInfo);
//     });
//   })
//
// }
