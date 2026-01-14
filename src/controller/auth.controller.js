const { sign } = require("jsonwebtoken");
const Users = require("../model/Users");
const { comparePassword } = require("../utils/encription/pashwordHash");

exports.login = async (req, res) => {
    try {
        const { UserEmail, UserPassword } = req.body;
        const user = await Users.findOne({ where: { UserEmail } });
        if (!user) {
            return res.status(404).json({ message: 'User not found, Please Contact Adminstrator' });
        }
        const isPasswordValid = comparePassword(UserPassword, user.UserPassword);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid Password' });
        }
        const token = await sign({ UserID: user.UserID }, process.env.JWT_SECRET, { expiresIn: '12h' });
        return res.status(200).json({ token });
    }catch(e) {
        console.error(e);
        res.status(500).json({ message: 'Server Error' });
    }
}