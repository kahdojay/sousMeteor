import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import { Meteor } from 'meteor/meteor';

export default class AddUserToTeamsForm extends Component {
  handleSubmit(e) {
    e.preventDefault();

    const phoneNumber = ReactDOM.findDOMNode(this.refs.phoneNumber).value.trim()
    const teamCodesString = ReactDOM.findDOMNode(this.refs.teamCodes).value.trim().toUpperCase()

    if (phoneNumber && teamCodesString) {
      const teamCodes = teamCodesString.split(/[\s,]+/)
      console.log('phoneNumber: ', phoneNumber)
      console.log('teamCodes: ', teamCodes)
      Meteor.call('addUserToTeamCodes', phoneNumber, teamCodes)
    } else {
      alert('moar inputs')
      throw new Meteor.Error('need-more-inputs');
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
                ref="phoneNumber"
              />
            </label>
          </div>
          <div>
            <label className="team-code">
              teamCodes to join (separated by comma):
              <input
                ref="teamCodes"
              />
            </label>
          </div>
          <button type="submit">Submit</button>
        </form>
      </div>
    )
  }
}