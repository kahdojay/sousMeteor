import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import { Meteor } from 'meteor/meteor';

export default class ImportTeams extends Component {
  handleSubmit(e) {
    e.preventDefault();

    Meteor.call('importTeams', (err, res) => {
      if (!err) {
        console.log('success')
      } else {
        // method error
      }
    })
  }

  render() {
    return (
      <div>
        <form 
          onSubmit={this.handleSubmit.bind(this)} 
        >
          <div>
            <label>
              Import All Teams:
            </label>
          </div>
          <button type="submit">Submit</button>
        </form>
      </div>
    )
  }
}