require('dotenv').config();

module.exports = {
  session: process.env.SESSION_DIR || 'sessions',

  status: {
    public: (process.env.MODE || 'public') === 'public',
  },

  owner:  process.env.OWNER  || 'COD-LUCAS',
  prefix: process.env.PREFIX || '.',

  sticker: {
    packname: process.env.PACK_NAME   || '𐍇 - 𐌼𐌴𐌾𐌰𐍄𐍂𐍈𐍀',
    author:   process.env.PACK_AUTHOR || 'COD-LUCAS',
  },

  messages: {
    owner:   'This command is for owner only',
    admin:   'This command is for group admins only',
    group:   'This command works in groups only',
    private: 'This command works in private chat only',
    wait:    'Please wait...',
    error:   'Something went wrong',
  }
};
