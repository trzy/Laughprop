/*
 * variable_expansion.mjs
 * Bart Trzynadlowski, 2023
 *
 * Functions for game scripting variable expansion.
 *
 * Two types of variables exist:
 *
 *  1. Global variables, stored in the global scripting context. They begin with a single '@'. For
 *     example: @theme
 *  2. Per-client variables, stored in the client's local scripting context. They beign with '@@'.
 *     For example: @@selected_image
 *
 * Within game scripts, some parameters may be variable expressions. That is, they may either be a
 * variable name, in which case a full substitution of the string with whatever the variable
 * contains is performed; or, they may be strings with inline references to variables that are
 * expanded as text. These are wrapped in '{' and '}'.
 *
 * For example, consider the following variables:
 *
 *  @foo = "Mr. Foo"
 *  @bar = "Mr. Bar"
 *  @baz = { 0: "xyz", 42: "ijk" }
 *
 * Then consider some possible parameters in script actions:
 *
 *  param1: "@foo"
 *  param2: "Who is {@bar}?"
 *  param3: { "a": "Hi, {@foo}.", b: "@baz" }
 *  param4: "@baz"
 *
 * If expansion is performed on these parameters, the results are:
 *
 *  param1 = "Mr. Foo"
 *  param2 = "Who is Mr. Bar?"
 *  param3 = { "a": "Hi, Mr. Foo.", b: { 0: "xyz", 42: "ijk" } }
 *  param4 = { 0: "xyz", 42: "ijk" }
 *
 * Note that arrays and dictionaries are recursively expanded. In the case of dictionaries, only
 * the values are expanded.
 *
 * In summary, when expansion is performed:
 *
 *  - A string beginning with '@' or '@@' is replaced with the contents of the variable it names.
 *  - A string containing "{@...}" has such occurrences replaced with the string representation of
 *    the variable named.
 */

// Expands a variable expression in a string with the string representation of the variable. Given
// inclusive start and end indices, replaces the characters at those posiitons with the variable
// named 'variable' if it exists in the state dictionary, otherwise does nothing. Returns the
// modified string as well as the next position after the expanded text.
function expandVariableInString(str, startIndex, endIndex, variable, state)
{
    if (startIndex >= str.length || endIndex <= startIndex || endIndex >= str.length)
    {
        return [str, endIndex + 1];
    }

    if (state == null || !(variable in state))
    {
        return [str, endIndex + 1];
    }

    const firstPiece = str.substring(0, startIndex);
    const expandedPiece = state[variable].toString();
    const lastPiece = str.substring(endIndex + 1, str.length);
    const newStr = firstPiece + expandedPiece + lastPiece;
    const nextIdx = firstPiece.length + expandedPiece.length;

    return [newStr, nextIdx];
}

function expandString(str, globalState, localState)
{
    // Find all {...} pairs. Nesting not supported. Look for '{@' and then next '}'. If the @ is
    // missing, it means the brackets are not a variable name and will be retained.
    let startIdx = null;
    let nextIdx = null;
    for (let i = 0; i < str.length; i++)
    {
        if (startIdx == null)
        {
            // Searching for leading '{@'
            if (str[i] == '{' && (i + 1) < str.length && str[i + 1] == '@')
            {
                startIdx = i;
            }
        }
        else
        {
            // Searching for closing '}'
            if (str[i] == '}')
            {
                // Expand
                const variable = str.substring(startIdx + 1, i);
                const state = variable.startsWith("@@") ? localState : globalState;
                [str, nextIdx] = expandVariableInString(str, startIdx, i, variable, state);

                // Reset search
                startIdx = null;

                // Ensure that on next loop iteration, we are at the next character
                i = nextIdx - 1;
            }
        }
    }

    return str;
}

function expand(variable, globalState, localState)
{
    if (typeof(variable) === "string")
    {
        // If begins with '@', perform full substitution
        if (variable.startsWith("@@") && localState != null && variable in localState)
        {
            return localState[variable];
        }
        else if (variable.startsWith("@") && globalState != null && variable in globalState)
        {
            return globalState[variable];
        }

        // Otherwise, perform string expansion on a copy of the string
        return expandString(variable.slice(), globalState, localState);
    }
    else if (variable instanceof Set)
    {
        // Construct a new set with expanded elements of old one
        const newSet = new Set();
        for (const item of variable)
        {
            newSet.add(expand(item, globalState, localState));
        }
        return newSet;
    }
    else if (variable.constructor === Array)
    {
        // New array with expanded elements of old one
        const newArray = [];
        for (const element of variable)
        {
            newArray.push(expand(element, globalState, localState));
        }
        return newArray;
    }
    else if (variable.constructor == Object)
    {
        // New object with values of old one expanded
        const newObj = {};
        for (const [key, value] of Object.entries(variable))
        {
            newObj[key] = expand(value, globalState, localState);
        }
        return newObj;
    }
    else
    {
        // No clue what this is
        return variable;
    }
}

export
{
    expand
}