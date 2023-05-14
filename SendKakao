import json
import requests

access_token = "7qBnog4wLBu5t3Xf8enGAFHJitrlVHcIryy0AXBACioljgAAAYgVoIPJ";

url = "https://kapi.kakao.com/v1/api/talk/friends" #친구 목록 가져오기
header = {"Authorization": 'Bearer ' + access_token}
result = json.loads(requests.get(url, headers=header).text)
friends_list = result.get("elements")
print(friends_list)
for i in range(0,2):
    friend_id = friends_list[i].get("uuid")
    print("친구 uuid: " + friend_id)

    # 카카오톡 메시지
    url= "https://kapi.kakao.com/v1/api/talk/friends/message/default/send"
    header = {"Authorization": 'Bearer ' + access_token}
    data={
        'receiver_uuids': '["{}"]'.format(friend_id),
        "template_object": json.dumps({
            "object_type":"text",
            "text":"포화 상태 쓰레기통이 있습니다. 비워주시기 바랍니다.",
            "link":{
                "web_url" : "https://aitong.kro.kr/",
                "mobile_web_url" : "https://aitong.kro.kr/"
            },
            "button_title": "지도 보기"
        })
    }
    response = requests.post(url, headers=header, data=data)
    response.status_code
