import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import { Meteor } from 'meteor/meteor';

export default class AddUserToUsersTeams extends Component {
  handleSubmit(e) {
    e.preventDefault();

    const phoneNumber1 = ReactDOM.findDOMNode(this.refs.phoneNumber1)
    const phoneNumber2 = ReactDOM.findDOMNode(this.refs.phoneNumber2)

    if (phoneNumber1 && phoneNumber2) {
      Meteor.call('joinUsersByPhone', phoneNumber1.value.trim(), phoneNumber2.value.trim(), (err, res) => {
        if (!err) {
          phoneNumber1.value = ''
          phoneNumber2.value = ''
        } else {
          // Meteor error
        }
      })
    } else {
      // form error
    }
  }

  render() {
    return (
      <div>
        <form 
          onSubmit={this.handleSubmit.bind(this)} 
        >
          <div>
            <label className="input">
              Phone number:
              <input
                ref="phoneNumber1"
              />
            </label>
          </div>
          <div>
            <label className="team-code">
              Phone number to join:
              <input
                ref="phoneNumber2"
              />
            </label>
          </div>
          <button type="submit">Submit</button>
        </form>
      </div>
    )
  }
}