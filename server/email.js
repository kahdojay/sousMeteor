if(Meteor.isServer){
  Meteor.methods({

    sendEmail: function(requestAttributes) {
      var emailOptions = {
        from_email: 'sous@sousapp.com',
        from_name: 'Sous',
        to: [{
          email: 'sous@sousapp.com',
          name: 'Sous',
          type: 'to'
        }],
        subject: 'No subject'
      }

      switch(requestAttributes.type) {
        case 'REQUEST_ORDER_GUIDE':
          emailOptions.from_email = requestAttributes.fromEmail;
          emailOptions.from_name = requestAttributes.fromName;
          emailOptions.to = [{
            email: 'orders@sousapp.com',
            name: 'Orders',
            type: 'to'
          }];
          emailOptions.subject = 'Order Guide Request';
          emailOptions.text = requestAttributes.body;
          break;

        case 'UPLOAD_ORDER_GUIDE':
          emailOptions.from_email = requestAttributes.fromEmail;
          emailOptions.from_name = requestAttributes.fromName;
          emailOptions.to = [{
            email: 'orders@sousapp.com',
            name: 'Orders',
            type: 'to'
          }];
          emailOptions.subject = requestAttributes.subject;
          emailOptions.text = requestAttributes.body;
          emailOptions.attachments = requestAttributes.attachments;
          break;

        case 'UPLOAD_ORDER_INVOICE':
          emailOptions.from_email = requestAttributes.fromEmail;
          emailOptions.from_name = requestAttributes.fromName;
          emailOptions.to = [{
            email: 'invoices@sousapp.com',
            name: 'Invoices',
            type: 'to'
          }];
          emailOptions.subject = requestAttributes.subject;
          emailOptions.text = requestAttributes.body;
          // emailOptions.attachments = requestAttributes.attachments;
          break;

        default:
          emailOptions.text = JSON.stringify(requestAttributes);
          break;

      }

      // // send bcc copy to dev
      // emailOptions.to.push({
      //   email: 'ilya@sousapp.com',
      //   name: 'Ilya Shindyapin',
      //   type: 'bcc'
      // })

      var debugEmailOptions = Object.assign({}, emailOptions);
      if(debugEmailOptions.hasOwnProperty('attachments') === true){
        debugEmailOptions.attachmentsCount = debugEmailOptions.attachments.length;
        delete debugEmailOptions.attachments;
      }
      log.debug('Sending email with options - type:', requestAttributes.type, ' email options:', debugEmailOptions);

      Mandrill.messages.send({
        message: emailOptions,
        async: false,
      }, function(result){
        log.debug('Email send result: ', result)
        return {
          success: true
        }
      }, function(e) {
        log.error('A mandrill error occurred: ' + e.name + ' - ' + e.message);
        return {
          success: false
        }
      })
    }
  })
}
