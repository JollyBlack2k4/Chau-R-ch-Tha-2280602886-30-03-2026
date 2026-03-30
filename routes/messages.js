var express = require('express');
var router = express.Router();
let messageModel = require('../schemas/message');
let { checkLogin } = require('../utils/authHandler');
let { uploadImage } = require('../utils/uploadHandler');
let path = require('path');

// GET /:userID - Lấy toàn bộ message giữa user hiện tại và userID
router.get('/:userID', checkLogin, async function (req, res, next) {
    try {
        let currentUserId = req.userId;
        let otherUserId = req.params.userID;

        // Lấy message từ user hiện tại gửi đến otherUserId hoặc từ otherUserId gửi đến user hiện tại
        let messages = await messageModel.find({
            $or: [
                { from: currentUserId, to: otherUserId },
                { from: otherUserId, to: currentUserId }
            ]
        })
            .populate('from', 'username email fullName avatarUrl')
            .populate('to', 'username email fullName avatarUrl')
            .sort({ createdAt: 1 });

        res.send({
            message: "Lấy message thành công",
            data: messages
        });
    } catch (error) {
        res.status(500).send({
            message: "Lỗi khi lấy message",
            error: error.message
        });
    }
});

// POST / - Gửi message mới (hỗ trợ text hoặc file)
router.post('/', checkLogin, uploadImage.single('file'), async function (req, res, next) {
    try {
        let currentUserId = req.userId;
        let toUserId = req.body.to;
        let messageText = req.body.messageContent;

        if (!toUserId) {
            return res.status(400).send({
                message: "Vui lòng cung cấp userID người nhận"
            });
        }

        // Kiểm tra loại message: text hay file
        let messageContent = {
            type: "text",
            text: messageText
        };

        // Nếu có file được upload
        if (req.file) {
            let filePath = path.join('uploads', req.file.filename);
            messageContent = {
                type: "file",
                text: filePath
            };
        }

        // Tạo message mới
        let newMessage = new messageModel({
            from: currentUserId,
            to: toUserId,
            messageContent: messageContent
        });

        await newMessage.save();

        // Populate dữ liệu user
        await newMessage.populate('from', 'username email fullName avatarUrl');
        await newMessage.populate('to', 'username email fullName avatarUrl');

        res.status(201).send({
            message: "Gửi message thành công",
            data: newMessage
        });
    } catch (error) {
        res.status(500).send({
            message: "Lỗi khi gửi message",
            error: error.message
        });
    }
});

// GET / - Lấy message cuối cùng của mỗi user mà user hiện tại nhắn tin hoặc user khác nhắn
router.get('/', checkLogin, async function (req, res, next) {
    try {
        let currentUserId = req.userId;

        // Lấy message cuối cùng từ mỗi conversation
        let conversations = await messageModel.aggregate([
            {
                $match: {
                    $or: [
                        { from: currentUserId },
                        { to: currentUserId }
                    ]
                }
            },
            {
                $addFields: {
                    otherUserId: {
                        $cond: [
                            { $eq: ['$from', currentUserId] },
                            '$to',
                            '$from'
                        ]
                    }
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: '$otherUserId',
                    lastMessage: { $first: '$$ROOT' }
                }
            },
            {
                $sort: { 'lastMessage.createdAt': -1 }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userInfo'
                }
            },
            {
                $unwind: '$userInfo'
            }
        ]);

        res.send({
            message: "Lấy danh sách conversation thành công",
            data: conversations
        });
    } catch (error) {
        res.status(500).send({
            message: "Lỗi khi lấy conversation",
            error: error.message
        });
    }
});

module.exports = router;
