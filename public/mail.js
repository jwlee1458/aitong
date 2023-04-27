const nodemailer = require( "nodemailer" );

// DB 연결
const mysql = require('mysql');
const connection = mysql.createConnection({
  host: "database-1.cfrpjjaaxr8j.ap-northeast-2.rds.amazonaws.com",
  user: "admin",
  password: "20181441",
  database: "trashcan_management"
});

// 연결 확인
connection.connect(function(err) {
  if (err) {
    console.error('DB 연결 실패: ' + err.stack);
    return;
  }
  console.log('DB 연결 성공');

  // 쿼리 실행
  const query = "SELECT TRASHCAN_ID_PK, LOCATION_ID_FK, TRASHCAN_LEVEL, ADMIN_ID_FK, ADMIN_EMAIL, ADMIN_RGN FROM trashcan_management.trashcan_tb a JOIN trashcan_management.admin_tb b ON a.ADMIN_ID_FK = b.ADMIN_ID_PK WHERE TRASHCAN_LEVEL >= 80;";
  connection.query(query, async function(error, results, fields) {
    if (error) {
      console.error('쿼리 실행 실패: ' + error.stack);
      return;
    }
    
    // 메일 발송
    async function main() {
      const transporter = nodemailer.createTransport({
        host: 'smtp.naver.com',
        port: 587,
        secure: false,
        auth: {
          user: 'eunhokim98@naver.com',
          pass: ''
        }
      });

      for (let i = 0; i < results.length; i++) {
        const row = results[i];
        const info = await transporter.sendMail({
          from: 'eunhokim98@naver.com',
          to : row["ADMIN_EMAIL"],
          subject: '쓰레기통 포화 상태 알림',
          html : 
          '안녕하세요, 원주시 '+row["ADMIN_RGN"]+' 쓰레기통 관리자님.<br>'
          + '일부 쓰레기통이 포화상태이며, 해당 쓰레기통의 상세 정보는 다음과 같습니다.<br><br>'
          + '<ul>'
          + '<li>쓰레기통 ID : ' + row["TRASHCAN_ID_PK"] + '</li>'
          + '<li>관리자 ID : ' + row["ADMIN_ID_FK"] + '</li>'
          + '<li>위치 ID : ' + row["LOCATION_ID_FK"] + '</li>'
          + '<li>적재량 : ' + row["TRASHCAN_LEVEL"] + '%</li>'
          + '</ul><br><br>'
          + '위와 같은 상황으로 인해 쓰레기통 주변에서 해충이 발생하고 악취가 퍼질 우려가 있습니다.<br>'
          + '따라서 적극적인 조치가 필요합니다.<br>'
          + '첨부된 파일을 확인하시면, '+row["ADMIN_RGN"]+' 포화 쓰레기통과 관리가 필요한 쓰레기통 목록을 확인하실 수 있습니다.<br>'
          + '또한, 다른 쓰레기통에 대한 정보를 확인하시려면 아래 사이트에 접속하여 정보를 확인해주세요.<br><br>'
          + '쓰레기통 지도 접속 : https://aitong.kro.kr<br>'
          ,
          attachments: [
            {
              filename: row["ADMIN_RGN"] + "_포화상태_쓰레기통_목록.xlsx",
              path: "https://aitong.kro.kr/file/" + encodeURI(row["ADMIN_RGN"])
            },
            {
              filename: row["ADMIN_RGN"] + "_1주일_이상_관리되지_않은_쓰레기통_목록.xlsx",
              path: "https://aitong.kro.kr/file/old/" + encodeURI(row["ADMIN_RGN"])
            }
          ]
        });
        console.log("메일 전송 완료 : %s", info.messageId);
      }
    }
    main().catch(console.error);
  });
});
