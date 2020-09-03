// Require Dependencies
const fetch = require('node-fetch')
const openid = require("openid");
const he = require('he')
const parser = require('fast-xml-parser')
// Main Class
class SteamAuth {
  constructor({
    realm,
    returnUrl,
    apiKey
  }) {
    if (!realm || !returnUrl || !apiKey)
      throw new Error(
        "Missing realm, returnURL or apiKey parameter(s). These are required."
      );

    this.realm = realm;
    this.returnUrl = returnUrl;
    this.apiKey = apiKey;
    this.relyingParty = new openid.RelyingParty(
      returnUrl,
      realm,
      true,
      true,
      []
    );
  }

  // Get redirect url for Steam
  async getRedirectUrl() {
    return new Promise((resolve, reject) => {
      this.relyingParty.authenticate(
        "https://steamcommunity.com/openid",
        false,
        (error, authUrl) => {
          if (error) return reject("Authentication failed: " + error);
          if (!authUrl) return reject("Authentication failed.");

          resolve(authUrl);
        }
      );
    });
  }

  // Fetch user
  async fetchIdentifier(steamOpenId) {
    return new Promise(async (resolve, reject) => {
      // Parse steamid from the url
      const steamId = steamOpenId.replace(
        "https://steamcommunity.com/openid/id/",
        ""
      );

      try {
        var resp = await fetch(`https://steamcommunity.com/profiles/${steamId}?xml=1`)
        var json = parser.parse(await resp.text(), {
          attributeNamePrefix: "@_",
          attrNodeName: "attr", //default is 'false'
          textNodeName: "#text",
          ignoreAttributes: true,
          ignoreNameSpace: false,
          allowBooleanAttributes: false,
          parseNodeValue: true,
          parseAttributeValue: false,
          trimValues: true,
          cdataTagName: "", //default is 'false'
          cdataPositionChar: "\\c",
          parseTrueNumberOnly: false,
          arrayMode: false, //"strict"
          attrValueProcessor: (val, attrName) => he.decode(val, {
            isAttributeValue: true
          }), //default is a=>a
          tagValueProcessor: (val, tagName) => he.decode(val), //default is a=>a
        })

        // Get the player
        const player = json.profile

        // Return user data
        resolve({
          _json: player,
          steamid: steamId,
          username: player.steamID,
          name: player.realname,
          avatar: {
            small: player.avatarIcon,
            medium: player.avatarmedium,
            large: player.avatarfull
          }
        });
      } catch (error) {
        reject("Steam server error: " + error.message);
      }
    });
  }

  // Authenticate user
  async authenticate(req) {
    return new Promise((resolve, reject) => {
      // Verify assertion
      this.relyingParty.verifyAssertion(req, async (error, result) => {
        if (error) return reject(error.message);
        if (!result || !result.authenticated)
          return reject("Failed to authenticate user.");
        if (
          !/^https?:\/\/steamcommunity\.com\/openid\/id\/\d+$/.test(
            result.claimedIdentifier
          )
        )
          return reject("Claimed identity is not valid.");

        try {
          const user = await this.fetchIdentifier(result.claimedIdentifier);
          return resolve(user);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}

// Export class
module.exports = SteamAuth;