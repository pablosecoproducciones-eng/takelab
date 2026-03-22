const twilio = require("twilio");

exports.handler = async (event) => {
  // 🔥 CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  const { telefono, nombre, fecha, hora } = JSON.parse(event.body);

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  try {
    await client.messages.create({
      from: "whatsapp:+14155238886",
      to: `whatsapp:+${telefono}`,
      body: `Hola ${nombre} 👋\nTu cita está confirmada para ${fecha} a las ${hora}.`,
    });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
