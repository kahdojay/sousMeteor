if(Meteor.isServer){
  Meteor.methods({
    faxOrder: function(options) {
      log.debug('sending fax to: ', options.number)
      log.error('This option has been disabled, please contact dev@sousapp.com for details')
      // if(options.number){
      //   var Phaxio = Npm.require('phaxio');
      //   var phaxio = new Phaxio(Meteor.settings.PHAXIO.KEY, Meteor.settings.PHAXIO.SECRET)
      //   var cb = function(err, data) {
      //     if (err) {
      //       log.error('PHAXIO SEND ERROR: ', err)
      //     } else {
      //       log.debug('PHAXIO SEND DATA: ', data)
      //     }
      //   }
      //   phaxio.sendFax({
      //     to: options.number,
      //     string_data: options.text,
      //     string_data_type: 'text',
      //   }, cb)
      // } else {
      //   log.error('PHAXIO ERROR: Missing to number.')
      // }
    }
  })

}
