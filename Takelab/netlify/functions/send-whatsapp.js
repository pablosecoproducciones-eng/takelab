const twilio = require("twilio");

exports.handler = async (event) => {
  const { telefono, nombre, fecha, hora } = JSON.parse(event.body);

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  try {
    await client.messages.create({
      from: "whatsapp:+14155238886",
      to: `whatsapp:${telefono}`,
      body: `Hola ${nombre} 👋\nTu cita está confirmada para ${fecha} a las ${hora}.`,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};