package com.widex.server;

/**
 * Server options, passed by the PC as "key=value" arguments.
 */
public final class Options {

    /** stream | list_apps | cleanup | screen_on */
    public String mode = "stream";
    public String scid = "0";
    public Ln.Level logLevel = Ln.Level.INFO;

    public boolean video = true;
    public boolean audio = true;
    public boolean control = true;
    public boolean sendDummyByte = true;

    /** h264 | h265 */
    public String videoCodec = "h264";
    public int videoBitRate = 8_000_000;
    /** Maximum size of the largest video dimension (0 = native resolution). */
    public int maxSize = 1920;
    public float maxFps = 60;
    public String encoderName = "";

    /** Display to mirror (mirror mode). */
    public int displayId = 0;
    /** "" = mirror an existing display; "1920x1080/240" = create a new virtual display ("desktop" mode). */
    public String newDisplay = "";

    public boolean stayAwake = true;
    public boolean turnScreenOff = false;

    // list_apps mode
    public int iconSize = 96;

    // cleanup mode
    public int watchPid = -1;

    public static Options parse(String... args) {
        Options options = new Options();
        for (String arg : args) {
            int eq = arg.indexOf('=');
            if (eq == -1) {
                throw new IllegalArgumentException("Invalid argument: " + arg);
            }
            String key = arg.substring(0, eq);
            String value = arg.substring(eq + 1);
            switch (key) {
                case "mode":
                    options.mode = value;
                    break;
                case "scid":
                    options.scid = value;
                    break;
                case "log_level":
                    options.logLevel = Ln.parseLevel(value);
                    break;
                case "video":
                    options.video = Boolean.parseBoolean(value);
                    break;
                case "audio":
                    options.audio = Boolean.parseBoolean(value);
                    break;
                case "control":
                    options.control = Boolean.parseBoolean(value);
                    break;
                case "send_dummy_byte":
                    options.sendDummyByte = Boolean.parseBoolean(value);
                    break;
                case "video_codec":
                    options.videoCodec = value;
                    break;
                case "video_bit_rate":
                    options.videoBitRate = Integer.parseInt(value);
                    break;
                case "max_size":
                    options.maxSize = Integer.parseInt(value) & ~7;
                    break;
                case "max_fps":
                    options.maxFps = Float.parseFloat(value);
                    break;
                case "encoder_name":
                    options.encoderName = value;
                    break;
                case "display_id":
                    options.displayId = Integer.parseInt(value);
                    break;
                case "new_display":
                    options.newDisplay = value;
                    break;
                case "stay_awake":
                    options.stayAwake = Boolean.parseBoolean(value);
                    break;
                case "turn_screen_off":
                    options.turnScreenOff = Boolean.parseBoolean(value);
                    break;
                case "icon_size":
                    options.iconSize = Integer.parseInt(value);
                    break;
                case "watch_pid":
                    options.watchPid = Integer.parseInt(value);
                    break;
                default:
                    Ln.w("Unknown option: " + key);
                    break;
            }
        }
        return options;
    }

    public boolean isNewDisplay() {
        return newDisplay != null && !newDisplay.isEmpty();
    }
}
