const express = require("express");
const router = express.Router();

const valid_token = ""; // 替换为自己的 token

router.get("/file/:token/:filename", (req, res) => {
    if (!req.params.token || !req.params.filename){
        return res.status(400).send({ code: 400, message: 'Missing params', data: '' });
    }
    const token = req.params.token;
    if (token != valid_token){
        return res.status(400).send({ code: 400, message: 'Authorization Failed', data: '' });
    }
    
    res.download(`/opt/qqbot/QQ/NapCat/temp/${req.params.filename}`, (error) => {
        if (!res.headersSent){
            console.log(error);
            return res.status(400).send({ code: 400, message: 'No such file', data: '' });
        }

        // 删除文件
        const fs = require('fs');
        fs.unlink(`/opt/qqbot/QQ/NapCat/temp/${req.params.filename}`, (err) => {
            if (err) {
                console.error(err);
            }
        });
    });
});

const app = express();
app.use(router);
app.listen(39999, () => {
    console.log('Server is running on port 39999');
});