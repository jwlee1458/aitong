const nodemailer = require( "nodemailer" );

// DB 연결
const mysql = require('mysql');
const connection = mysql.createConnection({
  host     : process.env.DB_HOST,
  user     : process.env.DB_USER,
  password : process.env.DB_PASSWORD,
  database : process.env.DB_DATABASE,
  port : process.env.DB_PORT
});

// 연결 확인
connection.connect(function(err) {
  if (err) {
    console.error('DB 연결 실패: ' + err.stack);
    return;
  }
  console.log('DB 연결 성공');

  // 관리가 필요한 상태 값 받고 데이터 조회
  const emailsAndIds = process.argv.slice(2).map(arg => arg.split(','));
  const uniqueEmails = emailsAndIds.find(args => args.some(arg => arg.includes('@'))) || [];
  const trashcanIds = emailsAndIds.find(args => args.some(arg => !arg.includes('@'))) || [];
  const emailList = uniqueEmails.map((email) => `'${email}'`);
  const query = `SELECT ADMIN_RGN, ADMIN_EMAIL FROM trashcan_management.admin_tb WHERE ADMIN_EMAIL IN (${emailList.join(',')})`;
  connection.query(query, async function(error, results, fields) {
    if (error) {
        console.error('쿼리 실행 실패: ' + error.stack);
        return;
    }

    // 메일 발송
    if (results) {
    for (const row of results) {
        const transporter = nodemailer.createTransport({
        host: "smtp.naver.com",
        port: 587,
        secure: false,
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASSWORD,
        },
        });

        const info = await transporter.sendMail({
          from: process.env.MAIL_USER,
          to: row.ADMIN_EMAIL,
          subject: "관리가 필요한 쓰레기통 알림",
          html : 
            '안녕하세요, 원주시 쓰레기통 관리자님.<br><br>'
            + '일부 쓰레기통이 마지막으로 관리된 지 1주일이 지났음을 알려드립니다.<br>'
            + '해당 쓰레기통의 상세 정보는 첨부된 파일에서 확인하실 수 있습니다.<br><br>'
            + '위와 같은 상황으로 인해 쓰레기통 주변에서 해충이 발생하고 악취가 퍼질 우려가 있으니, 빠른 조치가 필요합니다.<br>'
            + '또한, 다른 쓰레기통에 대한 정보를 확인하시려면 아래 사이트에 접속하여 정보를 확인해주세요.<br><br>'
            + '쓰레기통 지도 접속 : https://aitong.kro.kr<br>'
            ,
            attachments: [
              {
                filename: row["ADMIN_RGN"] + " 1주일 이상 관리되지 않은 쓰레기통 목록.xlsx",
                path: "https://aitong.kro.kr/file/old/" + encodeURI(row["ADMIN_RGN"])
              }
            ]
        });
        console.log(`메일 전송 완료: ${info.messageId}`);
    }

    if (trashcanIds) {
      for (const trashcanId of trashcanIds) {
        for (const trashcanId of trashcanIds) {
        // 현재 시간 (UTC+9 (한국 표준시) 적용)
        const now = new Date();
        const koreanNow = new Date(now.getTime() + (540 * 60 * 1000));
        const timeData = {
          year: koreanNow.getFullYear(),
          month: koreanNow.getMonth() + 1,
          date: koreanNow.getDate(),
          hours: koreanNow.getHours(),
          minutes: koreanNow.getMinutes(),
          seconds: koreanNow.getSeconds()
        };
        const formattedDate = `${timeData.year}-${('0' + timeData.month).slice(-2)}-${('0' + timeData.date).slice(-2)}`;
        const formattedTime = `${('0' + timeData.hours).slice(-2)}:${('0' + timeData.minutes).slice(-2)}:${('0' + timeData.seconds).slice(-2)}`;
        const dateTimeString = `${formattedDate} ${formattedTime}`;

        const sql = `UPDATE trashcan_tb SET TRASHCAN_LAST_EMAIL = '${dateTimeString}' WHERE TRASHCAN_ID_PK = '${trashcanId}'`;
        connection.query(sql, function (err, result, fields) {
          if (err) throw err;
        });  
        }
      }    
    }}
  });
});