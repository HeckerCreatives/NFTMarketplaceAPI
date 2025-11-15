const mongoose = require("mongoose");
const bcrypt = require('bcrypt');

const UsersSchema = new mongoose.Schema(
    {
        username: {
            type: String
        },
        password: {
            type: String
        },
        gametoken: {
            type: String
        },
        webtoken: {
            type: String
        },
        walletAddress: {
            type: String,
            unique: true,
            sparse: true, // allows multiple null values
            lowercase: true
        },
        walletNonce: {
            type: String
        },
        walletNonceExpiry: {
            type: Date
        },
        bandate: {
            type: String
        },
        banreason: {
            type: String
        },
        status: {
            type: String,
            default: "active"
        }
    },
    {
        timestamps: true
    }
);

UsersSchema.pre("save", async function (next) {

    if (this.isNew) {
        let unique = false;
        while (!unique) {
            const gameid = Math.floor(1000000000 + Math.random() * 9000000000).toString(); // Generate a 10-digit number
            const existingUser = await mongoose.models.Users.findOne({ gameid });
            if (!existingUser) {
                this.gameid = gameid;
                unique = true;
            }
        }
    }
    if (!this.isModified('password')){
        return next();
    }

    this.password = await bcrypt.hashSync(this.password, 10)
    next();
})



UsersSchema.methods.matchPassword = async function(password){
    return await bcrypt.compare(password, this.password)
}

const Users = mongoose.model("Users", UsersSchema)
module.exports = Users