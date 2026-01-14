const bcrypt = require('bcrypt');

const saltRounds = 10;

exports.generatePasswordHash = (password)=>{
    return bcrypt.hashSync(password, saltRounds);
}

exports.comparePassword = (password, hashedPassword)=>{
    return bcrypt.compareSync(password, hashedPassword);
}