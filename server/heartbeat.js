if(Meteor.isServer){
  Meteor.methods({
    '💓': function(data) {
      // console.log(data)
      return '😍'
    }
  })
}
