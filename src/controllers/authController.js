const authService = require("../services/authService");

exports.register = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = await authService.registerUser(username, password);
    req.session.userId = user._id;
    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = await authService.loginUser(username, password);
    req.session.userId = user._id;
    res.json({ message: "Logged in successfully", playerId: user._id });
  } catch (error) {
    next(error);
  }
};

exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res
        .status(500)
        .json({ error: "Could not log out, please try again" });
    }
    res.json({ message: "Logged out successfully" });
  });
};
