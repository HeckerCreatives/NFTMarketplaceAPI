const mongoose = require("mongoose");

const UserdetailsSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Users",
            index: true // Automatically creates an index on 'amount'
        },
        firstname: {
            type: String
        },
        lastname: {
            type: String
        },
        profilepicture: {
            type: String,
            default: "",
            index: true // Automatically creates an index on 'amount'
        }
    },
    {
        timestamps: true
    }
)

const Userdetails = mongoose.model("Userdetails", UserdetailsSchema)
module.exports = Userdetails