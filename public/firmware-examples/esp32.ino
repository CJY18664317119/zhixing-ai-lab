// AI Arena protocol example. Requires ArduinoJson library.
// Motor pins MUST be adapted to your driver; test with wheels lifted.
#include <ArduinoJson.h>
const int IN1=25, IN2=26, IN3=27, IN4=14;
unsigned long lastHeartbeat=0;
String buffer;
void stopMotors(){digitalWrite(IN1,LOW);digitalWrite(IN2,LOW);digitalWrite(IN3,LOW);digitalWrite(IN4,LOW);}
void setup(){Serial.begin(115200);pinMode(IN1,OUTPUT);pinMode(IN2,OUTPUT);pinMode(IN3,OUTPUT);pinMode(IN4,OUTPUT);stopMotors();}
void loop(){
 if(millis()-lastHeartbeat>1500)stopMotors();
 while(Serial.available()){
  char c=Serial.read();
  if(c!='\n'){if(buffer.length()<256)buffer+=c;else{buffer="";stopMotors();}continue;}
  JsonDocument doc;auto error=deserializeJson(doc,buffer);buffer="";
  if(error||doc["v"]!=1){stopMotors();continue;}
  String cmd=doc["cmd"]|"STOP";
  if(cmd=="HEARTBEAT"){lastHeartbeat=millis();continue;}
  if(cmd=="STOP"){stopMotors();}
  else if(millis()-lastHeartbeat<1500){
   // Safety-first example: no moving actions until PWM and motor wiring are configured.
   // Implement FORWARD/BACKWARD/LEFT/RIGHT here with speed clamped to 60%.
   stopMotors();
  }
  Serial.print("{\"v\":1,\"ack\":\"");Serial.print(cmd);Serial.println("\",\"motorEnabled\":false}");
 }
}
