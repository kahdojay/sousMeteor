if (Meteor.isServer) {
  Meteor.methods({
    submitPass: function(guess) {
      if (guess === Meteor.settings.WEB.PASS) {
        return true
      } else {
        return false
      }
    }
  })
}