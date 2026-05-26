'use strict';

const axios = require('axios');

module.exports = {
  command: ['carrier'],
  category: 'tools',
  desc: 'Look up carrier and details for a phone number',
  usage: '.true +918111857757',

  async execute(sock, m, context) {
    const { reply, args } = context;
    
    let number = args.join('');
    
    if (!number) {
      return reply('_Please provide a phone number._\n\n_Usage: .true +918111857757_');
    }
    
    // Remove spaces
    number = number.replace(/\s/g, '');
    
    try {
      const apiUrl = `https://number-carrier-1.onrender.com/url?num=${encodeURIComponent(number)}`;
      const response = await axios.get(apiUrl, { timeout: 15000 });
      const data = response.data;
      
      if (!data || data.status !== 'success' || !data.phone_valid) {
        return reply('_Could not find details for that number._\n_Make sure it includes the country code._\n_Example: .true +918111857757_');
      }
      
      const output = 
        `_Phone Number Information_\n\n` +
        `_Number   : ${data.international_number || data.phone || number}_\n` +
        `_Local    : ${data.local_number || '-'}_\n` +
        `_Carrier  : ${data.carrier || 'Unknown'}_\n` +
        `_Type     : ${data.phone_type || 'Unknown'}_\n` +
        `_Country  : ${data.country || 'Unknown'}_\n` +
        `_Valid    : ${data.phone_valid === true ? 'Yes' : 'No'}_`;
      
      return reply(output);
      
    } catch (error) {
      console.error('True error:', error);
      return reply('_Failed to fetch number details._\n_Please try again later._');
    }
  }
};