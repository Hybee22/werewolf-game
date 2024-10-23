const User = require('../models/User');

exports.registerUser = async (username, password) => {
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    throw new Error('Username already exists');
  }
  const user = new User({ username, password });
  await user.save();
  return user;
};

exports.loginUser = async (username, password) => {
  const user = await User.findOne({ username });
  if (!user || !(await user.comparePassword(password))) {
    throw new Error('Invalid username or password');
  }
  return user;
};
