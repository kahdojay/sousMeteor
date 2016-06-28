import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import { Meteor } from 'meteor/meteor';

export default class AddUserToTeamsForm extends Component {
  handleSubmit(e) {
    e.preventDefault();

    const phoneNumber = ReactDOM.findDOMNode(this.refs.phoneNumber)
    const teamCodesString = ReactDOM.findDOMNode(this.refs.teamCodes)

    if (phoneNumber && teamCodesString) {
      const teamCodes = teamCodesString.value.trim().toUpperCase().split(/[\s,]+/)
      Meteor.call('addUserToTeamCodes', phoneNumber.value.trim(), teamCodes, (err, res) => {
        if (!err) {
          phoneNumber.value = ''
          teamCodesString.value = ''
        }
      })
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